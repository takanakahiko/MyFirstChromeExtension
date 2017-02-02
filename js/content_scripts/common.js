"use strict";
let context = {};
let baseUrl, accessToken, user;

$(() => {
  initContext()
  .then(initPageContent)
  .then(getGithubRepos)
  .then(updateRepo)
  .then(updateBranch)
  .then(initPageEvent)
  .catch((err) => {
    console.log(err.message);
    switch (err.message) {
      case "need login" :
        initLoginContent();
        break;
      case "not match" :
        break;
      case "nothing" :
        break;
      default:
        //showAlert("Unknow Error", LEVEL_ERROR);
        break;
    }
  });
});

function initContext() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(["token","user", "baseUrl", "bindRepo", "bindBranch"], (item) => {
      if (!item.token) {
        reject(new Error("need login"));
      }
      accessToken = item.token;
      user = item.user;
      baseUrl = item.baseUrl;
      context.bindRepo = item.bindRepo || {};
      context.bindBranch = item.bindBranch || {};
      resolve();
    });
  })
}

function initPageContent() {
  return Promise.all([
    $.get(chrome.runtime.getURL('content/panel.html')),
    $.get(chrome.runtime.getURL('content/button.html'))
  ])
  .then((content) => {
    $('#boxUploadImages').after(content[0]);
    $('.assets').after(content[1]);
    tabmenuInit();
  })
  .then(() => {
    chrome.runtime.sendMessage({ cmd: "tab" });
  });
}

function tabmenuInit(){
  var tabList = (function () {
      // tab名を獲得
      var results = [];
      $('#boxShowCode, #boxEditCode').find('header li').filter(function (index) {
          if ($(this).attr('data-target-tab')) {
              return true;
          } else {
              return false;
          }
      }).each(function () {
          var targetTab = $(this).attr('data-target-tab');
          results.push(targetTab);
      });
      return results;
  })();
  $('#boxShowCode, #boxEditCode').find('header li[data-target-tab]').click(function () {
      // エディターのタブ切り替え機能
      var self = $(this);
      if (self.hasClass('active')) {
          return;
      }
      self.closest('header').find('li.active').removeClass('active');
      self.addClass('active');
      var target = self.attr('data-target-tab');
      $('#' + tabList.join(', #')).hide().removeClass('active');
      $('#'+target).show()
          .addClass('active')
          .find('.code').trigger('resizeBox');
      $('#ttl').focus();
      // 切り替えの時に、Compiled Codeを表示するDivを閉じて、デフォルトのDivに戻るselected tabJS initialTab
      if ($('.compiledCode.selected').length) {
          $('.compiledCode.selected').click();
      }
  });
}

function initLoginContent() {
  return Promise.all([
    $.get(chrome.runtime.getURL('content/login.html')),
    $.get(chrome.runtime.getURL('content/button.html'))
  ])
  .then((content) => {
    $('#boxUploadImages').after(content[0]);
    $('.assets').after(content[1]);
    tabmenuInit();
    $('#github-login').click(() => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options/options.html'));
      }
    });
    chrome.runtime.sendMessage({ cmd: "tab" });
  });
}

function followPaginate(data) {
  return new Promise((resolve, reject) => {
    $.getJSON(data.url)
    .then((response, status, xhr) => {
      data.items = data.items.concat(response);
      const link = xhr.getResponseHeader('Link');
      let url = null;
      if (link) {
        const match = link.match(/<(.*?)>; rel="next"/);
        url = match && match[1] ? match[1] : null;
      }
      resolve({ items: data.items, url: url });
    })
    .fail(reject);
  });
}


function getAllItems(promise) {
  return promise.then(followPaginate)
  .then((data) => {
    return data.url ? getAllItems(Promise.resolve(data), followPaginate) : data.items;
  })
}

function getGithubRepos() {
  return getAllItems(Promise.resolve({items: [], url: `${baseUrl}/user/repos?access_token=${accessToken}`}))
  .then((response) => {
    const repos = response.map((repo) => {
      return { name : repo.name, fullName : repo.full_name }
    });
    //if current bind still existed, use it
    const repo = context.bindRepo[context.id];
    if (repo && $.inArray(repo.name, repos.map(repo => repo.name)) >= 0 ) {
      context.repo = repo;
    }
    return repos;
  })
}

function updateRepo(repos) {
  $('#github-rep-menu').empty().append('<option>Create new repo</option>');

  for(let repo of repos){
    let content = $('<option>')
    .attr('value', repo.fullName)
    .text( repo.name );
    $('#github-rep-menu').append(content);
  }

  $( "#github-rep-menu" )
  .change(function () {
    let target = $("#github-rep-menu option:selected");
    let content;
    let label;
    const name = target.text();
    const fullName = target.attr('value');
    content = { name: name, fullName : fullName };
    label = name;
    context['repo'] = content;
    const bindName = `bindRepo`;
    Object.assign(context[bindName], { [context.id] : content });
    chrome.storage.sync.set({ [bindName]: context[bindName] }, () => {
      updateBranch();
    });
  })
  if (context.repo){
    $("select").val(repo.fullName);
    return context.repo.name;
  }
  return null;
}

function updateBranch() {
  if (!context.repo) {
    return null;
  }
  return getAllItems(Promise.resolve({items: [], url: `${baseUrl}/repos/${context.repo.fullName}/branches?access_token=${accessToken}`}))
  .then((branches) => {

    $('#github-branch-menu').empty().append('<option>Create new repo</option>');

    for(let branch of branches){
      let content = $('<option>')
      .attr('value', branch.fullName)
      .text( branch.name );
      $('#github-branch-menu').append(content);
    }

    let branch = context.bindBranch[context.id];
    if (!branch && branches.length === 0) {
      branch = "";
      showAlert("This repository do not has any branch yet, try to create a new branch such as [master].", LEVEL_WARN);
    } else if ($.inArray(branch, branches.map(branch => branch.name)) < 0) {
      branch = ($.inArray("master", branches.map(branch => branch.name)) >= 0) ? "master" : branches[0].name;
    }
    $('#github-bind-branch').text(`Branch: ${branch}`);
    //update context and storage
    context.branch = branch;
    Object.assign(context.bindBranch, { [context.id] : branch });
    chrome.storage.sync.set({ bindBranch: context.bindBranch });
    return branch;
  });
}

function initPageEvent(){
}
