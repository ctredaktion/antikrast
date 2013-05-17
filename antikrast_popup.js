/*
Antikrastinator v1.0
created by Herbert Braun (wortwart) 2013
for c't Magazin (www.ct.de), issue 12/2013
script for antikrast.html (standard popup)
*/

"use strict";
// get access to variables from background script antikrast.js
var bg = chrome.extension.getBackgroundPage();
// i18n issues
// Chrome extensions cannot simply offer different HTML files for different languages. That sucks.
var texts = [];
var textParagraph = [];
// fetch text fragments from _locales
for (var i = 0; i < 7; i++) texts.push(chrome.i18n.getMessage("popup" + i));
// mix them with placeholders for updated values
var placeholders = [
 '<span id="numberEntries">&nbsp;</span>',
 '<span id="numberDomains">&nbsp;</span>',
 '<span id="currentVisit">&nbsp;</span>',
 '<span id="lastDomain">&nbsp;</span>.'
];
for (var i = 0; i < 4; i++) {
 textParagraph.push(texts.shift());
 textParagraph.push(placeholders.shift());
}

window.addEventListener("DOMContentLoaded", function() { // onload
 console.log('Popup loaded');
 // inject i18n text fragments
 $("p:first-of-type").innerHTML = textParagraph.join(" ");
 $("#updatePopup").innerHTML = texts.shift();
 $("label[for='autoCleanup']").innerHTML = texts.shift();
 $("h1:last-of-type").innerHTML = texts.shift();
 bg.autoCleanup = $('#autoCleanup').checked; // hand over value for autoCleanup of database
 bg.cleanDb();
 $("#updatePopup").addEventListener("click", function() {
  // update popup when user clicks refresh button
  console.log('Refreshing popup');
  updatePopup();
 });
 $('#autoCleanup').addEventListener("change", function() {
  // record change in autoCleanup setting
  bg.autoCleanup = this.checked;
  bg.cleanDb();
 });
 updatePopup(); // update popup on first load
});

var updatePopup = function() {
 // updates popup
 console.info('updatePopup called');
 // update automatically every 10 seconds
 var updatePopupTimeout = window.setTimeout(updatePopup, 10000);
 bg.domainCheck(); // check domain and update database if necessary
 var date = new Date;
 var currentVisit, currentVisitString, currentDomain;
 var domainList = $('ul');
 domainList.innerHTML = '';
 var groupList = $('ul:last-of-type');
 bg.db.transaction(function(tx) {
  // outputs information about surfing behaviour
  tx.executeSql('SELECT COUNT(*) AS count FROM visits', [], function(tx, res) {
   $('#numberEntries').innerHTML = res.rows.item(0)['count'];
  });
  tx.executeSql('SELECT COUNT(DISTINCT domain) AS count FROM visits', [], function(tx, res) {
   $('#numberDomains').innerHTML = res.rows.item(0)['count'];
  });

  // outputs information about current domain
  tx.executeSql('SELECT start FROM visits WHERE domain = ? AND duration IS NULL ORDER BY id DESC LIMIT 1', [bg.lastDomain], function(tx, res) {
   if (!res.rows.length) {
    // no information about last domain
    currentVisitString = chrome.i18n.getMessage("unknownTime");
    currentDomain = chrome.i18n.getMessage("unknownDomain");
    console.log("no current entry for " + bg.lastDomain + " found in database");
   } else {
    currentVisit = Date.now() - res.rows.item(0)['start'];
    currentVisitString = bg.formatTime(currentVisit);
    currentDomain = bg.lastDomain;
    console.log('updatePopup: current duration for ' + bg.lastDomain + ': ' + currentVisitString);
   }
   $('#currentVisit').innerHTML = currentVisitString;
   $('#lastDomain').innerHTML = currentDomain;
  });

  // outputs list of the five most visited domains
  tx.executeSql('SELECT domain, SUM(duration) AS sum FROM visits WHERE day = ? AND month = ? AND year = ? GROUP BY domain ORDER BY sum DESC LIMIT 5', [date.getDate(), date.getMonth(), date.getYear()], function(tx, res) {
   for (var i = 0; i < res.rows.length; i++) {
    var line = res.rows.item(i);
    var sumDuration = parseInt(line["sum"]);
    if (line['domain'] == currentDomain && currentVisit) sumDuration += currentVisit;
    domainList.innerHTML += '<li>' + line['domain'] + " <i>" + bg.formatTime(sumDuration) + "</i></li>\n";
   }
  });

  // outputs group list
  tx.executeSql('SELECT id, name FROM groups', [], function(tx, res) {
   groupList.innerHTML = '';
   for (var i = 0; i <= res.rows.length; i++) {
    var id = (i < res.rows.length)? res.rows.item(i)['id'] : 0;
    var name = (i < res.rows.length)? res.rows.item(i)['name'] : chrome.i18n.getMessage("newGroup");
    var li = '<li>' + name + ' <a href="groups.html?id=' + id + '">';
    li += id? chrome.i18n.getMessage("edit") : chrome.i18n.getMessage("create");
    li += '</a></li>' + "\n";
    groupList.innerHTML += li;
   }
  });
 });
};

var $ = function(el) {
 // command shortener
 return document.querySelector(el);
};
