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
const {Cu} = require("chrome");
const {makeWindowHelpers} = require("makeWindowHelpers");
const {suggest} = require("suggest");
const {unload} = require("unload+");
const {watchWindows} = require("watchWindows");

Cu.import("resource://gre/modules/Services.jsm", this);

exports.main = function(options) {
  // per-window initialization
  watchWindows(function(window) {
    let {change, createNode, listen, unload} = makeWindowHelpers(window);
    let {document, gBrowser} = window;
    let search = window.BrowserSearch.searchBar;

    unload(cleanUp);

    // Prepare the active previewBrowser
    let previewBrowser = createNode("browser");
    previewBrowser.hidden = true;
    previewBrowser.setAttribute("type", "content");
    previewBrowser.style.borderRadius = "10px";
    previewBrowser.style.boxShadow = "5px 5px 20px black";
    previewBrowser.style.margin = "100px";
    previewBrowser.style.overflow = "hidden";

    function showPreview(url) {
      if (!previewItem.hasAttribute("checked"))
        return;
      if (previewBrowser.getAttribute("src") == url)
        return;

      if (previewBrowser.hidden) {
        gBrowser.selectedBrowser.parentNode.appendChild(previewBrowser);
        previewBrowser.hidden = false;
      }
      previewBrowser.setAttribute("src", url);
      gBrowser.selectedBrowser.style.opacity = ".5";
    }

    // Prevent errors from browser.js/xul when it gets unexpected title changes
    previewBrowser.addEventListener("DOMTitleChanged", function(event) {
      event.stopPropagation();
    }, true);

    // Pages might try to focus.. so move it back
    previewBrowser.addEventListener("focus", function(event) {
      search.focus();
      search._textbox.selectionStart = search._textbox.selectionEnd;
    }, true);

    let menu = createNode("menupopup");
    menu.setAttribute("ignorekeys", "true");

    document.getElementById("mainPopupSet").appendChild(menu);
    unload(function() {
      menu.parentNode.removeChild(menu);
    });

    let generalItems = [];
    let generalSeparator = createNode("menuseparator");
    menu.appendChild(generalSeparator);

    let contextItems = [];
    let contextSeparator = createNode("menuseparator");
    menu.appendChild(contextSeparator);

    let contextItem = createNode("menuitem");
    contextItem.setAttribute("label", "Use current page for suggestions");
    contextItem.setAttribute("checked", "true");
    contextItem.setAttribute("type", "checkbox");
    menu.appendChild(contextItem);

    let previewItem = createNode("menuitem");
    previewItem.setAttribute("label", "Preview highlighted terms");
    previewItem.setAttribute("checked", "true");
    previewItem.setAttribute("type", "checkbox");
    menu.appendChild(previewItem);

    // Build the menu list for a query and context
    function buildList(query, tabContext) {
      query = query.replace(/^\s+/, "");

      // Determine what context to use
      let queryContext = "";
      if (contextItem.hasAttribute("checked")) {
        try {
          let {currentURI} = tabContext.linkedBrowser;
          let domain = Services.eTLD.getBaseDomain(currentURI);
          queryContext = domain.match(/^[^.]+/)[0];
        }
        catch(ex) {}
      }

      // Immediately hide context items if they won't be used
      if (queryContext == "") {
        contextItems.forEach(function(item) {
          item.setAttribute("hidden", "true");
        });
        contextSeparator.setAttribute("hidden", "true");
      }

      function addItems(results, items, separator) {
        // Show/hide the separator below the items as necessary
        if (results.length == 0) {
          separator.setAttribute("hidden", "true");
        }
        else {
          separator.removeAttribute("hidden");
        }

        // Create menu items to insert into the list
        results.forEach(function({completion, icon, target}, index) {
          let item = items[index]
          if (item == null) {
            item = createNode("menuitem");
            item.setAttribute("class", "menuitem-iconic");
            menu.insertBefore(item, separator);
            items.push(item);
          }

          item.setAttribute("image", icon);
          item.setAttribute("label", completion);
          item.setAttribute("url", target);
          item.removeAttribute("hidden");
        });

        // Hide any unused items
        for (let i = results.length; i < items.length; i++) {
          items[i].setAttribute("hidden", "true");
        }
      }

      // Get suggestions and add them to the menu
      suggest(query, queryContext, function({general, context}) {
        addItems(general, generalItems, generalSeparator);
        addItems(context, contextItems, contextSeparator);

        // Auto-select the first result if it's showing
        let first = generalItems[0];
        if (first == null || first.hidden) {
          first = contextItems[0];
        }
        if (first != null && !first.hidden) {
          first.setAttribute("_moz-menuactive", "true");

          // Explicitly show a preview because it might be selected already
          showPreview(first.getAttribute("url"));
        }
      });
    }

    // Handle menu items getting activated
    let activeItem;
    menu.addEventListener("DOMAttrModified", function({attrName, target}) {
      if (attrName != "_moz-menuactive")
        return;

      // Track the newly activated item
      if (target.hasAttribute("_moz-menuactive")) {
        // Mouse event activated a different target, so clear the previous item
        if (activeItem != null && activeItem != target) {
          activeItem.removeAttribute("_moz-menuactive");
        }
        activeItem = target;
        showPreview(activeItem.getAttribute("url"));
      }
      // Item is deactivating, so untrack if it's the one
      else if (target == activeItem) {
        activeItem = null;
      }
    });

    // Handle keyboard navigation
    listen(search.parentNode, "keypress", function(event) {
      // Move down the list
      if (event.keyCode == event.DOM_VK_DOWN) {
        // Start with the first item if there's nothing
        let next = activeItem == null ? menu.firstChild : activeItem.nextSibling;
        while (next != null && (next.hidden || next.nodeName != "menuitem")) {
          next = next.nextSibling;
        }
        if (next != null) {
          next.setAttribute("_moz-menuactive", "true");
        }
        else if (activeItem != null) {
          activeItem.removeAttribute("_moz-menuactive");
        }
        event.stopPropagation();
      }
      // Move up the list
      else if (event.keyCode == event.DOM_VK_UP) {
        let prev = activeItem == null ? menu.lastChild : activeItem.previousSibling;
        while (prev != null && prev.nodeName != "menuitem") {
          prev = prev.previousSibling;
        }
        if (prev != null) {
          prev.setAttribute("_moz-menuactive", "true");
        }
        else if (activeItem != null) {
          activeItem.removeAttribute("_moz-menuactive");
        }
        event.stopPropagation();
      }
      // Skip to the next list
      else if (event.keyCode == event.DOM_VK_TAB) {
        if (activeItem == null) {
          menu.firstChild.setAttribute("_moz-menuactive", "true");
        }
        else if (contextItems[0] != null && !contextItems[0].hidden) {
          if (contextItems[0].compareDocumentPosition(activeItem) == 2) {
            contextItems[0].setAttribute("_moz-menuactive", "true");
          }
          else {
            generalItems[0].setAttribute("_moz-menuactive", "true");
          }
        }
        event.preventDefault();
      }
      // Trigger the selected item
      else if (event.keyCode == event.DOM_VK_RETURN) {
        if (activeItem != null) {
          let url = activeItem.getAttribute("url");
          search.value = activeItem.getAttribute("label");
          menu.hidePopup();

          let {selectedBrowser} = gBrowser;
          selectedBrowser.loadURI(url);
          selectedBrowser.focus();

          previewBrowser.style.MozTransition = "1s";
          previewBrowser.style.borderRadius = "";
          previewBrowser.style.margin = "";

          selectedBrowser.addEventListener("DOMContentLoaded", function onEnd() {
            selectedBrowser.removeEventListener("DOMContentLoaded", onEnd);

            window.setTimeout(function() {
            selectedBrowser.style.opacity = "";
            previewBrowser.hidden = true;
            previewBrowser.style.MozTransition = "";
            previewBrowser.style.borderRadius = "25px";
            previewBrowser.style.margin = "100px";
            }, 250);
          });
          event.stopPropagation();
        }
      }
      // Clean up on escape
      else if (event.keyCode == event.DOM_VK_ESCAPE) {
        // Dismiss the menu
        if (menu.state != "closed") {
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
        event.stopPropagation();
      }
    });

    // Detect when to show suggestions
    listen(search, "input", function(event) {
      let {name} = Services.search.currentEngine;
      // XXX steal inputs for everything for debugging
      if (true || name == "Blekko") {
        menu.openPopup(search, "after_start");
        buildList(search.value, gBrowser.selectedTab);
        event.stopPropagation();
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
      menu.hidePopup();
      gBrowser.selectedBrowser.style.opacity = "";
      previewBrowser.hidden = true;
      previewBrowser.removeAttribute("src");
      if (previewBrowser.parentNode != null)
        previewBrowser.parentNode.removeChild(previewBrowser);
    }
  });
}
