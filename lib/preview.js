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
const {Ci,Cu} = require("chrome");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");
const {trace} = require("dumper");

Cu.import("resource://gre/modules/Services.jsm", this);

function Preview( configObject ) {
    this._window = configObject.window;
	this._focusHandler = configObject.onFocus;
	this._isMouseIn = false;
	this.makeABrowser( );
}

Preview.prototype = {

    makeABrowser: function( ) {

    let {change, createNode, listen, unload} = makeWindowHelpers(this._window);

    // Prepare the new previewBrowser
    let previewBrowser = createNode("browser");
    previewBrowser.hidden = true;
    previewBrowser.setAttribute("type", "content");
    previewBrowser.style.borderRadius = "10px";
    previewBrowser.style.boxShadow = "5px 5px 20px black";
    previewBrowser.style.margin = "100px";
    previewBrowser.style.overflow = "hidden";

    // Prevent errors from browser.js/xul when it gets unexpected title changes
    previewBrowser.addEventListener("DOMTitleChanged", function(event) {
      event.stopPropagation();
    }, true);

    previewBrowser.addEventListener("mouseover", function(event) {
		this._isMouseIn = true;
    }.bind( this ), true);

    previewBrowser.addEventListener("mouseout", function(event) {
		this._isMouseIn = false;
    }.bind( this ), true);

    // Pages might try to focus.. so move it back
    previewBrowser.addEventListener("focus", function(event) {
      this._focusHandler( event );
    }.bind(this), true);

    this._browser = previewBrowser;
	},

    show: function (url) {
      let gBrowser = this._window.gBrowser;
      let previewBrowser = this._browser;

      if (previewBrowser.getAttribute("src") == url)
        return;

      if (previewBrowser.hidden) {
        gBrowser.selectedBrowser.parentNode.appendChild(previewBrowser);
        previewBrowser.hidden = false;
      }

      previewBrowser.setAttribute( "src" , url);
      gBrowser.selectedBrowser.style.opacity = ".5";

    } ,

    slideIn: function ( inUrl ) {
      let selectedBrowser = this._window.gBrowser.selectedBrowser;
	  let previewBrowser = this._browser;
      let url = previewBrowser.getAttribute("src") || inUrl;

      // look here for swap doc exmaple 
	  // https://github.com/mozilla/prospector/blob/master/instantPreview/bootstrap.js#L67
      // console.log( url );
      selectedBrowser.style.opacity = "";
      selectedBrowser.loadURI(url);
      selectedBrowser.focus();

      previewBrowser.blur( );
      this.cleanUp( );
    },

	cleanUp: function( ) {
      let selectedBrowser = this._window.gBrowser.selectedBrowser;
	  let previewBrowser = this._browser;

	  this._isMouseIn = false;

      selectedBrowser.style.opacity = "";
      previewBrowser.hidden = true;
      previewBrowser.removeAttribute("src");
      if (previewBrowser.parentNode != null)
        previewBrowser.parentNode.removeChild(previewBrowser);
    },

	isMouseIn: function( ) { 
		return this._isMouseIn;
    }

}

exports.Preview = Preview;
