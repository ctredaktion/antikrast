/*
Antikrastinator v1.0
created by Herbert Braun (wortwart) 2013
for c't Magazin (www.ct.de), issue 12/2013
Chrome extension background script
*/

"use strict";
var activeTab, lastDomain, lastInsert, autoCleanup;
var browserFocus = true;

// open or create SQLite database
var db = openDatabase('antikrastinator', '1.0', 'Logs your surf history', 2 * 1024 * 1024);
db.transaction(function(tx) {
 tx.executeSql("CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, domain TEXT, start INTEGER, end INTEGER, duration INTEGER, day INTEGER, month INTEGER, year INTEGER)");
 tx.executeSql("CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT, duration INTEGER)");
 tx.executeSql("CREATE TABLE IF NOT EXISTS groupdomains (id INTEGER PRIMARY KEY, groupid INTEGER, domain TEXT)");
});
console.log('Database created or loaded: ' + Date.now());

// Events
chrome.windows.onFocusChanged.addListener(function(windowId) {
 // fires when Chrome window focus changes
 if (windowId == chrome.windows.WINDOW_ID_NONE) {
  browserFocus = false;
  console.log("Browser not in focus");
  var date = new Date();
  dbEntry(lastDomain, false, date); // enter end date for last db row
 } else {
  browserFocus = true;
  console.log("Browser back in focus");
  domainCheck(); // check URL in active tab
 }
});

chrome.tabs.onActivated.addListener(function(tab) {
 // fires when active tab changes
 console.log("Changed tab to #" + tab.tabId);
 if (tab.tabId === undefined) {
  console.warn('tabId problem when tabs.onActivated'); // shouldn't happen
  return;
 }
 activeTab = tab.tabId;
 domainCheck(); // check URL in active tab
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
 if (changeInfo.status == 'loading') return; // react only when page is loaded (status == "complete")
 if (tabId === undefined) {
  console.warn('tabId problem when tabs.onUpdated'); // shouldn't happen
  return;
 }
 if (tabId == activeTab) {
  console.log("New URL in active tab #" + activeTab);
  domainCheck(); // check URL in active tab
 }
});

chrome.alarms.create('displayAlarm', {when: Date.now() + 1000, periodInMinutes: 1});
chrome.alarms.onAlarm.addListener(function(alarm) {
 // checks URL every minute (mostly to update popup window)
 if (alarm.name == 'displayAlarm') {
  console.log('Checking domain automatically');
  domainCheck(); // check URL in active tab
 }
});

var domainCheck = function() {
 // wrapper: checks active tab and calls function for identifying the domain and updating the database
 // wrappers are necessary because of asynchronous database calls
 console.log('domainCheck called');
 if (!activeTab) { // find out id of active tab unless already known
  chrome.tabs.query({
   "active": true,
   "currentWindow": true,
   "windowType": "normal"
  }, function(tabs) {
   if (!tabs[0]) {
    console.warn("domainCheck: no tabs found"); // shouldn't happen
    return;
   }
   activeTab = tabs[0].id;
   console.log('domainCheck: identified active tab #' + tabs[0].id);
   _domainCheck();
  });
 } else {
  _domainCheck();
 }
};

var _domainCheck = function() {
 // identifies the domain and updates the database if necessary
 // should be called only by wrapper function domainCheck()
 console.info('_domainCheck called');
 if (!browserFocus) {
  console.log("_domainCheck: Chrome window not in focus");
  return; // do nothing if no Chrome window is in focus
 }
 if (activeTab === undefined || activeTab == false) { // no active tab detected? That's bad.
  console.warn('_domainCheck: no active tab found');
  return;
 }
 chrome.tabs.get(activeTab, function(tab) { // fetch URL of active tab
  var fulldomain = tab.url.replace(/^\w+:\/+/, '').replace(/\/.*$/, '');
  var tmp = fulldomain.split('.');
  while (tmp.length > 3) tmp.shift();
  var domain = tmp.join('.'); // regex and array operations converted URL in domain with at most 3 levels
    if (!domain) console.warn('_domainCheck: no domain found for ' + tab.url + ' in tab #' + activeTab); // shouldn't happen
  if (domain == lastDomain) { // domain hasn't changed: check duration
   dbCheck(domain);
   return;
  }
  // domain has changed: prepare database update with dbEntry and check duration.
  console.log('_domainCheck: changed from domain ' + lastDomain + ' to ' + domain);
  var date = new Date();
  dbEntry(lastDomain, domain, date);
  dbCheck(domain);
 });
};

var dbEntry = function(domain_old, domain_new, date) {
 // wrapper: searches for lastInsert and calls writing function
 console.info('dbEntry called: ' + domain_old + ' ' + domain_new + ' ' + date);
 if (lastInsert) {
  // ID of last inserted row can be fetched from database but performance is critical
  // this value is saved when creating new entries but can be lost, e.g. after restarting the browser
  console.log('dbEntry: last insert id is row #' + lastInsert);
  _dbEntry(lastInsert, domain_new, date);
 } else if (!domain_old) {
  // to set an end date we check for the last domain
  // is it safe to just set that date for the last database entry without checking its domain?
  console.warn('dbEntry: last domain not defined');
  // dbEntry can be called without domain_new to just set an end date for the last database entry
  if (domain_new) _dbEntryNewLine(domain_new, date);
 } else {
  // we have domain_old but not lastInsert: let's fetch it from the database
  db.transaction(function(tx) {
   tx.executeSql('SELECT MAX(id) AS lastID FROM visits WHERE end IS NULL AND domain = ?', [domain_old], function(tx, res) {
    if (!res.rows.length) {
     // there is no entry to close: just create an entry for domain_new
     _dbEntry(null, domain_new, date);
    } else {
     var id = res.rows.item(0)['lastID'];
     console.log('dbEntry: last insert id (via database query) is row #' + id);
     // set end date for last database record and create new entry
     _dbEntry(id, domain_new, date);
    }
   });
  });
 }
};

var _dbEntry = function(id, domain_new, date) {
 // writes end date for previous entry and prepares creating a row for domain_new
 // should be called only by wrapper function dbEntry()
 console.info('_dbEntry called: ' + id + ' ' + domain_new + ' ' + date);
 if (!id) { // no database record to finish
  console.log('_dbEntry: no entry for last insert handed over');
  if (domain_new) _dbEntryNewLine(domain_new, date); // create new entry
  return;
 }
 var time = date.getTime();
 db.transaction(function(tx) { // update last database record
  tx.executeSql('UPDATE visits SET end = ?, duration = ? - start WHERE id = ?', [time, time, id], function(tx) {
   console.log('_dbEntry: wrote end date in row #' + id);
   lastInsert = false;
   if (domain_new) _dbEntryNewLine(domain_new, date); // create new entry
  });
 });
};

var _dbEntryNewLine = function(domain_new, date) {
 // creates entry for domain_new
 // should only be called by _dbEntry() or dbEntry()
 console.info('_dbEntryNewLine called: ' + domain_new + ' ' + date);
 if (!domain_new) { // makes no sense
  console.warn('_dbEntryNewLine: called without value for domain');
  return;
 }
 db.transaction(function(tx) { // writes a new row in the database
  tx.executeSql('INSERT INTO visits (domain, start, day, month, year) VALUES (?, ?, ?, ?, ?)', [domain_new, date.getTime(), date.getDate(), date.getMonth(), date.getYear()], function(tx, res) {
   console.log('_dbEntryNewLine: new last insert ' + res.insertId);
   // save id of lastInsert so that we don't have to fetch it from the database later
   // but set lastInsert only if the last data set was terminated properly
   lastInsert = lastInsert == false? res.insertId : false;
   lastDomain = domain_new; // for comparison in _domainCheck()
   console.log('_dbEntryNewLine: wrote ' + domain_new + ' ' + date + ' in database');
  });
 });
}

var dbCheck = function(domain) {
 // checks if current domain belongs to a defined group and compares with usage time
 console.info('dbCheck called: ' + domain);
 if (!domain) return;
 db.transaction(function(tx) {
  // check if there is a group for the current domain recorded in the database
  tx.executeSql('SELECT g.id, g.name, g.duration FROM groups g, groupdomains gd WHERE g.id = gd.groupid AND gd.domain = ?', [domain], function(tx, res) {
   if (!res.rows.length) return;
   // yes, there is a matching group:
   var group = res.rows.item(0);
   console.log('dbCheck: ' + domain + ' is in group ' + group['id'] + ' (' + group['name'] + ')');
   var date = new Date;
   // fetch total duration of visits on domains associated with group from database
   tx.executeSql('SELECT SUM(duration) AS sum FROM visits WHERE domain IN (SELECT domain FROM groupdomains WHERE groupid = ?) AND day = ? AND month = ? AND year = ?', [group['id'], date.getDate(), date.getMonth(), date.getYear()], function(tx, res) {
    var sum = res.rows.item(0)['sum'];
    console.log('dbCheck: sum for group ' + group['name'] + ': ' + formatTime(sum));
    // add time spent on current web page
    // we search for the last row in the database if it matches the current domain and has an empty duration
    // SQL can't do this in a single query so we check the last record with JavaScript
    tx.executeSql('SELECT MAX(id), start, domain, duration FROM visits', [], function(tx, res) {
     var line = res.rows.item(0);
     if (line['domain'] == domain && !line['duration']) {
      var current = Date.now() - line['start'];
      sum += current;
      console.log('dbCheck: time currently spent on ' + domain + ': ' + formatTime(current));
     }
     // check if acceptable time has been overstepped and if so, annoy the user
     if (sum > group['duration'] * 60000) {
      console.log('dbCheck: overstepped acceptable time for group ' + group['name']);
      // annoy user only if the popup is not open
      // otherwise the alert would keep coming back as it is a change of the active tab
      if (!chrome.extension.getViews({type: "popup"}).length) annoy(group['name'], group['duration'], sum);
     }
    });
   });
  });
 });
};

var annoy = function(b_group, b_duration, b_sum) {
 // alerts when user surfs to long on certain web sites
 // we could do a lot of more interesting things here ...
 console.info('annoy called');
 b_sum = formatTime(b_sum);
 // fetch warning message from _locales
 var warning = chrome.i18n.getMessage("warning1") + b_sum + chrome.i18n.getMessage("warning2") + b_group + chrome.i18n.getMessage("warning3") + b_duration + chrome.i18n.getMessage("warning4");
 console.warn(warning);
 // bring alert box into the web page context
 chrome.tabs.executeScript(activeTab, {code: 'alert("' + warning + '");'});
};

var cleanDb = function() {
 // deletes old datasets if this option is checked in the popup
 if (!autoCleanup) return;
 console.info('cleanDb called');
 var date = new Date();
 db.transaction(function(tx) {
  console.log('cleanDb: cleaning up old data records');
  tx.executeSql('DELETE FROM visits WHERE day != ? OR month != ? OR year != ?', [date.getDate(), date.getMonth(), date.getYear()], function(tx, res) {
   if (res.rowsAffected) console.log('cleanDb: deleted ' + res.rowsAffected + ' lines');
  });
 });
};

var formatTime = function(milliseconds) {
 // converts milliseconds into a human readable format
 var minutes = Math.round(milliseconds / 60000);
 var hours = Math.floor(minutes / 60);
 var minutesLeft = minutes % 60;
 if (!hours && !minutesLeft) return chrome.i18n.getMessage("lessThan1Minute");
 else return hours + ':' + (minutesLeft < 10? '0' : '') + minutesLeft + ' h';
};
