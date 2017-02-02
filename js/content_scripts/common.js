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

  context = {};
  const match = window.location.href.match(/http:\/\/jsdo\.it\/([^/]*)\/([^/]*)\/edit/);
  if (!match) return Promise.reject(new Error("not match"));
  context.isBound = match[1] === "/macros";
  context.id = match[2];

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

function initPageEvent(){
  $('#github-push-button')
  .click(function(){
    initProjectContext()
    .then(prepareCode)
    .then(githubPush);
  });
  $('#github-pull-button')
  .click(function(){
    initProjectContext()
    .then(prepareCode)
    .then(githubPull);
  });
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
    Object.assign(context[`bindRepo`], { [context.id] : content });
    chrome.storage.sync.set({ [`bindRepo`]: context[`bindRepo`] }, () => {
      updateBranch();
    });
  })
  if (context.repo){
    $("select").val(context.repo.fullName);
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

function initProjectContext() {

  let promises = [];

  let js = new Promise((resolve, reject) => {
    resolve({
      file : "script.js",
      content: $('#codeJS').val()
    });
  })
  promises.push(js);

  let html = new Promise((resolve, reject) => {
    resolve({
      file : "index.html",
      content: $('#codeHTML').val()
    });
  })
  promises.push(html);

  let css = new Promise((resolve, reject) => {
    resolve({
      file : "style.css",
      content: $('#codeCSS').val()
    });
  })
  promises.push(css);

  return Promise.all(promises);
}

function prepareCode(jsdoitFiles) {
  return new Promise((resolve, reject) => {
    $.getJSON(
      `${baseUrl}/repos/${context.repo.fullName}/branches/${context.branch}`,
      { access_token: accessToken }
    )
    .then(resolve)
    .fail(reject);
  })
  .then((response) => {
    return $.getJSON(
      `${baseUrl}/repos/${context.repo.fullName}/git/trees/${response.commit.commit.tree.sha}`,
      { recursive: 1, access_token: accessToken }
    );
  })
  .then((response) => {
    const promises = response.tree.filter((tree) => {
      return tree.type === 'blob' && /(\.css|\.html|\.js)$/.test(tree.path);
    })
    .map((tree) => {
      return new Promise((resolve, reject) => {
        $.getJSON(tree.url, {access_token: accessToken })
        .then((content) => {
          resolve({ file: tree.path, content: decodeURIComponent(escape(atob(content.content)))});
        })
        .fail(reject)
      });
    });
    return Promise.all(promises);
  })
  .then((data) => {
    const files = $('.item').toArray().reduce((hash, e) => {
      const match = e.innerText.match(/(.*?)\.(gs|html)$/);
      if (!match || !match[1] || !match[2]) return hash;
      hash[match[1]] = match[0];
      return hash;

    }, {});
    const code = {
      jsdoit: jsdoitFiles.reduce((hash, elem) => {
        if (elem) hash[elem.file] = elem.content;
        return hash;
      }, {}),
      github: data.reduce((hash, elem) => {
        if (elem) hash[elem.file] = elem.content;
        return hash;
      }, {})
    }
    console.log(code);
    return code;
  })
}

function githubPush(code) {
  const promises = ["script.js","index.html","style.css"].map((elem) => {
    const file = elem;
    const payload = {
      content: code.jsdoit[file],
      encoding: "utf-8"
    };
    return $.ajax({
      url: `${baseUrl}/repos/${context.repo.fullName}/git/blobs`,
      headers: {
        "Authorization": `token ${accessToken}`
      },
      method: 'POST',
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    })
    .then((response) => {
      return {file: file, blob: response};
    })
  });
  if (promises.length === 0) {
    showAlert("Nothing to do", LEVEL_WARN);
    return;
  }

  Promise.all([
    Promise.all(promises),
    $.getJSON(
      `${baseUrl}/repos/${context.repo.fullName}/branches/${context.branch}`,
      { access_token: accessToken }
    )
  ])
  .then((responses) => {
    const tree = responses[0].map((data) => {
      return {
        path: data.file,
        mode: "100644",
        type: "blob",
        sha: data.blob.sha
      }
    });
    const payload = {
      base_tree: responses[1].commit.commit.tree.sha,
      tree: tree
    };
    return $.ajax({
      url: `${baseUrl}/repos/${context.repo.fullName}/git/trees`,
      headers: {
        "Authorization": `token ${accessToken}`
      },
      method: 'POST',
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    })
    .then((response) => {
      return Object.assign(response, { parent: responses[1].commit.sha })
    });
  })
  .then((response) => {
    const payload = {
      message: "commit from jsdo.it",
      tree: response.sha,
      parents: [
        response.parent
      ]
    };
    console.log(JSON.stringify(payload));
    return $.ajax({
      url: `${baseUrl}/repos/${context.repo.fullName}/git/commits`,
      headers: {
        "Authorization": `token ${accessToken}`
      },
      method: 'POST',
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
  })
  .then((response) => {
     const payload = {
      force: true,
      sha: response.sha
    };
    return $.ajax({
      url: `${baseUrl}/repos/${context.repo.fullName}/git/refs/heads/${context.branch}`,
      headers: {
        "Authorization": `token ${accessToken}`
      },
      method: 'PATCH',
      crossDomain: true,
      dataType: 'json',
      contentType: 'application/json',
      data: JSON.stringify(payload)
    });
  })
  .then(() => {
    showAlert(`Successfully push to ${context.branch} of ${context.repo.name}`);
  })
  .catch((err) => {
    showAlert("Failed to push", LEVEL_ERROR);
  });
}


function githubPull(code) {
  const promises = ["script.js","index.html","style.css"].map((elem) => {
    const file = elem;
    const match = file.match(/(.*?)\.(js|html|css)$/);
    if (!match || !match[1] || !match[2]) {
      showAlert('Unknow Error', LEVEL_ERROR);
      return;
    }
    const name = match[1];
    const type = match[2];

    if (!code.jsdoit[file]) {
      return jsdoitCreateFile(name, type)
      .then(() => {
        return jsdoitUpdateFile(name, code.github[file]);
      })
    } else {
      return jsdoitUpdateFile(name, code.github[file]);
    }
  });
  if (promises.length === 0) {
    showAlert("Nothing to do", LEVEL_WARN);
    return;
  }

  initProjectContext()
  .then(() => {
    return Promise.all(promises);
  })
  .then(() => {
    showAlert("Successfully pulled from github");
    location.reload();
  })
  .catch((err) => {
    console.log(err.message);
  });
}


function jsdoitUpdateFile(file, code) {
  return new Promise((resolve, reject) => {
    console.log(file);
    switch(file){
      case "script":
      $('#codeJS').val(code).text(code);break;
      case "index":
      $('#codeHTML').val(code).text(code);break;
      case "style":
      $('#codeCSS').val(code).text(code);break;
    }
    resolve();
  });
}
