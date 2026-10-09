// Installed before page scripts, solely for structural capture. Never replace
// the site's own API: its interactions continue using the original live globals.
function installNativeScrollDOM() {
  const key=Symbol.for('gusto.structural.capture.native-scroll');
  if(!window[key])Object.defineProperty(window,key,{value:Object.freeze({
    windowScrollTo:window.scrollTo,
    elementScrollTo:Element.prototype.scrollTo,
  })});
}
module.exports={installNativeScrollDOM};
