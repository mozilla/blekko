/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Blekko.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2012
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Edward Lee <edilee@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";
const {XMLHttpRequest} = require("xhr");
const simplePrefs = require("simple-prefs");


// set up defaults
const BLEKKO_ICON = "http://blekko.com/s/favicon.png";
const SUGGEST_URL = "http://blekko.com/ff-nav-suggest?q=";
const SEARCH_URL = "http://blekko.com/ws/?source=ffsuggest&q=";
const BLEKKO_SEARCH_MANIFEST = "http://blekko.com/s/blekko.xml";

function getSuggestUrl(query) {
  let prefix = ( simplePrefs.prefs.blekko_suggest_url || SUGGEST_URL );
  return prefix + encodeURIComponent(query);
}

function getSearchUrl(query) {
  let prefix = ( simplePrefs.prefs.blekko_search_url || SEARCH_URL );
  return prefix + encodeURIComponent(query);
}

function xhr(url, onComplete) {
  let req = new XMLHttpRequest();
  req.open("GET", url);
  req.onreadystatechange = function(event) {
    if (req.readyState == 4 && req.status == 200) {
      onComplete(JSON.parse(req.responseText));
    }
  };
  req.send(null);
}

/**
 * Get suggestions for a query and a context
 *
 * @param query [string] Partially typed query to complete
 * @param queryContext [string] Arbitrary string context
 * @param onComplete [function] Handle completion results
 */
exports.suggest = function(query, queryContext, onComplete) {
  let generalResults, contextResults;

  // Trigger the callback with results if we're done
  function checkDone() {
    if (generalResults != null && contextResults != null) {
      onComplete({
        general: generalResults,
        context: contextResults
      });
    }
  }

  // Get general/context-independent results
  xhr(getSuggestUrl(query), function(ret) {
    generalResults = (ret.results || []).slice(0, 5);

    // Add in a dummy completion if there's nothing
    if (generalResults.length == 0 && query != "") {
      generalResults.push({
        completion: query,
        icon: ( simplePrefs.prefs.blekko_icon_url || BLEKKO_ICON ),
        target: getSearchUrl(query)
      });
    }

    checkDone();
  });

  // Don't bother fetching without a context
  if (queryContext == "") {
    contextResults = [];
    return;
  }

  // Get context-specific results
  let contextPrefix = queryContext + " ";
  console.log( "CONTEXT " + queryContext + " " + query);
  xhr(getSuggestUrl(contextPrefix + query), function(ret) {
    contextResults = [];

    // Only match completions that start with the prefix
    (ret.results || []).forEach(function({completion, icon, target}) {
      if (completion.indexOf(contextPrefix) == 0) {
        contextResults.push({
          completion: completion.slice(contextPrefix.length),
          icon: icon,
          target: target
        });
      }
    });

    contextResults = contextResults.slice(0, 5);
    checkDone();
  });
}


exports.getEngineDescr = function ( ) {

return {

  bIcon: ( simplePrefs.prefs.blekko_icon_url || BLEKKO_ICON ) ,
  bName: "blekko",
  bManifest: ( simplePrefs.prefs.blekko_manifest_url || BLEKKO_SEARCH_MANIFEST )

};

}

