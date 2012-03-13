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
 *   Maxim Zhilayev <mzhilyaev@mozilla.com>
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
const {Ci,Cu,Cc} = require("chrome");
const tabs = require("tabs");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {suggest,getEngineDescr} = require("suggest");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");
const {Preview} = require("preview");
const {CompletionMenu} = require("completionMenu");
const simplePrefs = require("simple-prefs");

Cu.import("resource://gre/modules/Services.jsm", this);
const PromptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
const ObserverService = require("observer-service");
var gCurrentInput;

exports.main = function(options) {
try {

  // test for blekko's presence in the engine list
  let { bIcon , bName , bManifest } = getEngineDescr( );
  let SearchService = Services.search;

  //console.log( "starting " + bName + " " + SearchService.currentEngine.name );
  if( SearchService.currentEngine.name != bName ) {
	if( !SearchService.getEngineByName( bName ) ) {
		// not even installed, install
		let window = Services.wm.getMostRecentWindow("navigator:browser");
        let confirmed = PromptService.confirm( window , 
							"Installing Blekko Search Addon" , 
							"This extention requires Blekko Search Enigne be your default search engine." );
        if( confirmed ) {
            debug( "Installing the enigne " + bManifest);
			SearchService.addEngine( bManifest , 1 , "" , false );
        }
		else {
			return;  // just bail out
		}
	}
    // blekko is not the current engine, but so what - the user can always switch to it
  }

  // per-window initialization
  watchWindows(function(window) {
    let {change, createNode, listen, unload} = makeWindowHelpers(window);
    let {document, gBrowser} = window;
    let search = window.BrowserSearch.searchBar;
	  
    // Prepare the active previewBrowser, make sure that focus points back to
	// window.BrowserSearch.searchBar - so that the page loaded does not focus

    let previewBrowser = new Preview( 
		{
		  window: window , 
		  onFocus:  function( event ) {
						search.focus();
        				search._textbox.selectionStart = search._textbox.selectionEnd;
					}
		});

    let menu = new CompletionMenu( 
	  {
	  	window: window,
		onItemActivation: function( itemData ) {
		   if( menu.doPreview( ) ) {
				previewBrowser.show( itemData.url );
		   }
	    },
		onMenuHide: function ( event ) {
			// menu is hindig, but if a user clicked on the preview
            // we have to load it into the tab browser
			if( previewBrowser.isMouseIn( ) ) {
				previewBrowser.slideIn( );
            } else {
				previewBrowser.cleanUp( );
			}
		},
		onItemClick: function( itemData ) {
			slideIn( itemData );
		}
      });

    function slideIn( itemData ) {
        if (itemData.completion != null) {
          search.value = itemData.completion;
          previewBrowser.slideIn( itemData.url );
          menu.hide();
          cleanUp( );
        }      
    }

	function showSuggestions( ) {
      // check if there's something in the searchbar
      if( SearchService.currentEngine.name != bName ) return false; // return false to propogate events as usual
	  if( search.value ) {
      	menu.show(search, "after_start");
      	buildList(search.value, gBrowser.selectedTab);
	  }
      return true;   // this will block event propagation
	}
					
    // Build the menu list for a query and context
    function buildList(query, tabContext) {
	 try{
      query = query.replace(/^\s+/, "");

      // Determine what context to use
      let queryContext = "";
      if ( menu.doContextCompletions( )) {
        try {
          let {currentURI} = tabContext.linkedBrowser;
          let domain = Services.eTLD.getBaseDomain(currentURI);
          queryContext = domain.match(/^[^.]+/)[0];
        }
        catch(ex) {}
      }

      // Immediately hide context items if they won't be used
      if (queryContext == "") {  
	  	menu.hideContextCompletions( ); 
      }

      // Get suggestions and add them to the menu
      suggest(query, queryContext, function({general, context}) {
        menu.addGeneralItems( general );
        menu.addContextItems( context );

        // Auto-select the first result if it's showing
		menu.selectFirst( );

      });
	 }
	 catch( ex ) {  console.log( "ERROR" + ex ); }
    }

    function showSearchString( ) {
      let itemData = menu.getActiveItemData( );
	  if( itemData.url == null ) {
	  	search.value = gCurrentInput;
	  } else {
	  	search.value = itemData.completion;
	  }
	  search._textbox.setSelectionRange(100,100);
//	  search._textbox.selectionStart = search._textbox.selectionEnd = 0;
	}

    // Handle keyboard navigation
    listen(search.parentNode, "keypress", function(event) {
      // check if the engine is blekko, return otherwise
      if( SearchService.currentEngine.name != bName ) return;
      event.stopPropagation();

      // Move down the list
      if (event.keyCode == event.DOM_VK_DOWN) {
	    menu.moveDown( );
		showSearchString( );
      }
      // Move up the list
      else if (event.keyCode == event.DOM_VK_UP) {
	    menu.moveUp( );
		showSearchString( );
      }
      // Skip to the next list
      else if (event.keyCode == event.DOM_VK_TAB) {
	    menu.tabTrough( );
		showSearchString( );
      }
      // Trigger the selected item
      else if (event.keyCode == event.DOM_VK_RETURN) {
	    let itemData = menu.getActiveItemData( );
		if( itemData.url ) {   // if there's a url to being with
        		slideIn( itemData );
		} else {
			// preform a regular search action
			search.handleSearchCommand ( event );
			cleanUp( );
		}
      }
      // Clean up on escape
      else if (event.keyCode == event.DOM_VK_ESCAPE) {
        // Dismiss the menu
        if ( ! menu.isOpen( ) ) {
          cleanUp();
        }
        // Clear the input
        else if (search.value != "") {
          search.value = "";
        }
        // Blur the search box
        else {
          gBrowser.selectedBrowser.focus();
        }
      }
    });

    // Detect when to show suggestions
	listen( search , "click" , function(event) {
      if( event.originalTarget.nodeName != "xul:button" && showSuggestions( ) ) {
			// if showSuggestions returned success - stop events
      		// event.stopPropagation( );
	  }
	});

    // Detect when to show suggestions
    listen(search, "input", function(event) {
	  gCurrentInput =  search.value;
      if( showSuggestions( ) ) {
			// if showSuggestions returned success - stop events
      		event.stopPropagation( );
	  }
    });

    // Hide suggestions and previews when closing tabs
    listen(gBrowser.tabContainer, "TabClose", function({target}) {
      cleanUp();
    });

    // Hide suggestions and previews when switching tabs
    listen(gBrowser.tabContainer, "TabSelect", function() {
      cleanUp();
    });

    function cleanUp() {
      menu.hide();
      gBrowser.selectedBrowser.style.opacity = "";
      previewBrowser.cleanUp( );
    }
  });

}
catch ( ex ) {

	console.log( "ERROR" + ex );

}
}
