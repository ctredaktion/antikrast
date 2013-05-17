/*
Antikrastinator v1.0
created by Herbert Braun (wortwart) 2013
for c't Magazin (www.ct.de), issue 12/2013
script for groups.html
*/

"use strict";
var db = openDatabase('antikrastinator', '1.0', 'Logs your surf history', 2 * 1024 * 1024);
// i18n issues
// Chrome extensions cannot simply offer different HTML files for different languages. That sucks.
var texts = [];
// fetch text fragments from _locales
for (var i = 0; i < 7; i++) texts.push(chrome.i18n.getMessage("popupGroup" + i));
var replaceTags = [ // DOM query strings whose content will be overwritten
 "label[for='name']",
 "label[for='duration']",
 "label[for='domains']",
 "label[for='delete']",
 "button:last-of-type",
 "a:last-of-type"
];

window.addEventListener("DOMContentLoaded", function() { // onload
 console.log('Group view loaded');
 // inject i18n text fragments
 $("title").innerHTML = $("h1").innerHTML = texts.shift();
 for (var i = 0; i < replaceTags.length; i++) $(replaceTags[i]).innerHTML = texts.shift();
 // extract URL parameter for group id (should have been sent from antikrast.html)
 var querystring;
 if (!(querystring = window.location.search)) {
  console.warn('No URL parameter transmitted to group view');
  return;
 }
 var id = parseInt(querystring.substring(querystring.indexOf('=') + 1));
 if (id >= 0) console.log('View for group #' + id);
 else {
  console.warn('No valid ID transmitted to group view: ' + id);
  id = 0;
 }
 $('#id').value = id;

 db.transaction(function(tx) {
  // clean up database
  tx.executeSql('DELETE FROM groups WHERE name IS NULL');
  tx.executeSql('DELETE FROM groups WHERE groups.id IN (SELECT g.id FROM groups g LEFT JOIN groupdomains gd ON g.id = gd.groupid WHERE gd.id IS NULL);'); // deletes groups without domains
  tx.executeSql('DELETE FROM groupdomains WHERE groupdomains.id IN (SELECT gd.id FROM groupdomains gd LEFT JOIN groups g ON g.id = gd.groupid WHERE g.id IS NULL);'); // deletes domains without groups
  // fetch group record (otherwise we're creating a new one)
  tx.executeSql('SELECT name, duration FROM groups WHERE id = ?', [id], function(tx, res) {
   if (!res.rows.length) {
    id = 0;
    console.log('New Group');
   } else {
    $('#name').value = res.rows.item(0)['name'];
    $('#duration').value = res.rows.item(0)['duration'];
    // fetch connected domain records and write them in a <textarea>
    var domains = new Array();
    tx.executeSql('SELECT domain FROM groupdomains WHERE groupid = ?', [id], function(tx, res) {
     for (var i = 0; i < res.rows.length; i++) domains.push(res.rows.item(i)['domain']);
     $('#domains').value = domains.join("\n");
    });
   }
  });
 });
 $('button').addEventListener("click", function() { // after click on send button
  if ($('#delete').checked && id) { // user wants to delete group
   db.transaction(function(tx) {
    tx.executeSql('DELETE FROM groupdomains WHERE groupid = ?', [id]);
    tx.executeSql('DELETE FROM groups WHERE id = ?', [id]);
    console.log('Group #' + id + ' deleted');
   });
   back(); // return to antikrast.html
  }
  // prepare inserted data for database entry
  var gname = $('#name').value.trim();
  var gduration = $('#duration').value.trim();
  var gdomains = $('#domains').value.trim().split(/[\s,]+/);
  gduration = parseInt(gduration);
  // if data are missing alert the user
  if (!gname || !gduration || isNaN(gduration) || gdomains.length == 0) {
   var warning = chrome.i18n.getMessage("warningGroup");
   console.warn(warning);
   alert(warning);
   return;
  }
  db.transaction(function(tx) { // enter data in database
   if (id) { // edit existing group
    tx.executeSql('UPDATE groups SET name = ?, duration = ? WHERE id = ?', [gname, gduration, id]);
    console.log('Group #' + id + ' updated');
    tx.executeSql('DELETE FROM groupdomains WHERE groupid = ?', [id]); // delete old group domains
    insertDomains(tx, id, gdomains); // writes group domains in database
    back();
   } else { // create new group
    tx.executeSql('INSERT INTO groups (name, duration) VALUES (?, ?)', [gname, gduration], function(tx, res) {
     console.log('Group #' + res.insertId + ' created');
     insertDomains(tx, res.insertId, gdomains); // writes group domains in database
     back(); // return to antikrast.html
    });
   }
  });
 });
});

var insertDomains = function(tx, id, gdomains) {
 // writes group domains into database
 for (var i = 0; i < gdomains.length; i++) {
  var sql = 'INSERT INTO groupdomains (groupid, domain) VALUES (?, ?)';
  tx.executeSql(sql, [id, gdomains[i]]);
  // if we have a 2 level domain add a second entry with the subdomain www
  // we don't make a difference between google.com and www.google.com
  var tmp = gdomains[i].split('.');
  if (tmp.length == 2) {
   tmp.unshift('www');
   tx.executeSql(sql, [id, tmp.join('.')]);
  }
 }
 console.log(gdomains.length + ' domains created for group');
}

var $ = function(el) {
 // command shortener
 return document.querySelector(el);
};

var back = function() {
 // returns to antikrast.html
 document.location.href = 'antikrast.html';
}