/** Reveal downloaded server images before React's larger bundles hydrate. */
export const imageLoadBootstrap = `document.addEventListener('load',function(event){var image=event.target;if(image instanceof HTMLImageElement&&image.hasAttribute('data-resilient-image'))image.style.visibility='';},true);`;
