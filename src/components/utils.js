export async function getBase64FromUrl(url) {
  const data = await fetch(url);
  const blob = await data.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob); 
    reader.onloadend = () => {
      const base64data = reader.result;   
      resolve(base64data);
    }
  });
}

export function compileLaTeX(text, callback, {color="currentColor"}={}) {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.top = "-1000px";
  document.body.appendChild(div);
  const se = document.createElement("script");
  se.setAttribute("type", "math/tex");
  se.innerHTML = text;
  div.appendChild(se);
  window.MathJax.Hub.Process(se, () => {
      // When processing is done, remove from the DOM
      // Wait some time before doing that because MathJax calls this function before
      // actually displaying the output
      const display = () => {
          // Get the frame where the current Math is displayed
          const frame = document.getElementById(se.id + "-Frame");
          if (!frame) {
              setTimeout(display, 500);
              return;
          }
          
          // Load the SVG
          const svg = frame.getElementsByTagName("svg")[0];
          svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          svg.setAttribute("version", "1.1");
          const height = svg.parentNode.offsetHeight;
          const width = svg.parentNode.offsetWidth;
          svg.setAttribute("height", height);
          svg.setAttribute("width", width);
          svg.removeAttribute("style");
          
          // Embed the global MathJAX elements to it
          const mathJaxGlobal = document.getElementById("MathJax_SVG_glyphs");
          svg.appendChild(mathJaxGlobal.cloneNode(true));
          
          // Create a data URL
          const svgSource = '<?xml version="1.0" encoding="UTF-8"?>' + "\n" + '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' + "\n" + svg.outerHTML.replaceAll("currentColor", color);
          const retval = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgSource)));
          
          // Remove the temporary elements
          document.body.removeChild(div);
          
          // Invoke the user callback
          callback(retval, width, height);
      };
      setTimeout(display, 200);
  });
}