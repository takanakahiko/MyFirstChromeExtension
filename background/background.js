"use strict";
chrome.webRequest.onBeforeRequest.addListener((details) => {
  //const body = String.fromCharCode.apply(null, new Uint8Array(details.requestBody.raw[0].bytes));
  let formData = null;
  if(details && details.requestBody && details.requestBody.formData) formData = details.requestBody.formData;
  console.log({
    url: details.url,
    param: formData
  });
},
{
  urls: [ "http://jsdo.it/api/*" ],
  types: ["xmlhttprequest"]
},
[
  "requestBody"
]);

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  const headers = details.requestHeaders
  .reduce((hash, header) => {
    hash[header.name] = header.value;
    return hash;
  }, {});
  chrome.storage.local.set({ requestUrl: details.url, requestHeaders: headers });
  console.log(headers);
},
{
  urls: [ "http://jsdo.it/api/*" ],
  types: ["xmlhttprequest"]
},
[
  "requestHeaders"
]);
