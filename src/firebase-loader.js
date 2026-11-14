/**
 * Lazy Firebase loader.
 *
 * Phase Board is local-first: a visitor who never signs in should not
 * download the Firebase SDKs or call gstatic at all. This loads them on demand,
 * once, and reuses the same promise for every caller.
 *
 *   await loadFirebase()                   // Phase Board
 *   await loadFirebase({ storage: true })  // also loads Cloud Storage
 */
(function () {
    "use strict";

    var script = document.currentScript;
    if (!script) return;
    var configUrl = new URL("firebase-config.js", script.src).href;
    var VERSION = "10.12.2";
    var SDK = {
        app: "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-app-compat.js",
        auth: "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-auth-compat.js",
        firestore: "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-firestore-compat.js",
        storage: "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-storage-compat.js"
    };

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var element = document.createElement("script");
            element.src = src;
            element.async = false;
            element.onload = function () { resolve(); };
            element.onerror = function () { reject(new Error("Could not load " + src)); };
            document.head.appendChild(element);
        });
    }

    window.loadFirebase = function (options) {
        options = options || {};
        if (typeof firebase !== "undefined" && typeof firebaseConfig !== "undefined") {
            return Promise.resolve(true);
        }
        if (window.__qolFirebasePromise) return window.__qolFirebasePromise;

        var chain = [SDK.app, SDK.auth, SDK.firestore];
        if (options.storage) chain.push(SDK.storage);
        chain.push(configUrl);

        window.__qolFirebasePromise = chain.reduce(function (promise, src) {
            return promise.then(function () { return loadScript(src); });
        }, Promise.resolve()).then(function () {
            return true;
        }).catch(function (error) {
            console.error("QoL: Firebase failed to load.", error);
            window.__qolFirebasePromise = null;
            return false;
        });

        return window.__qolFirebasePromise;
    };
})();
