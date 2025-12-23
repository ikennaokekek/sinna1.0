// fix-widgets.js

// Auto-patch the widget files (headers, script paths, dev UI)



const fs = require("fs");

const path = require("path");



// Helper to apply text replacement safely

function patchFile(filePath, replaceFn) {

  const full = path.join(process.cwd(), filePath);

  if (!fs.existsSync(full)) {

    console.error(`❌ File not found: ${filePath}`);

    return;

  }



  let content = fs.readFileSync(full, "utf8");

  const updated = replaceFn(content);



  if (updated !== content) {

    fs.writeFileSync(full, updated, "utf8");

    console.log(`✓ Patched: ${filePath}`);

  } else {

    console.log(`— No changes needed: ${filePath}`);

  }

}



// 1️⃣ Fix header text in the base widget

patchFile("widget/src/SinnaPresetBase.js", (text) =>

  text

    .replace(/Sinna Accessibility Presets/g, "SINNA 1.0")

    .replace(/Select a preset to analyze your video/g, "Accessibility, Automated")

);



// 2️⃣ Fix script loader paths in demo

patchFile("widget/demo/index.html", (text) =>

  text

    .replace(/\.\.\/dist\/dev-widget\.js/g, "/dist/dev-widget.js")

    .replace(/\.\.\/dist\/widget\.js/g, "/dist/widget.js")

);



// 3️⃣ Ensure developer UI method exists

patchFile("widget/src/SinnaPresetDev.js", (text) => {

  if (text.includes("renderDeveloperUI")) {

    return text; // Already exists

  }



  // Add basic developer UI method

  return (

    text +

    `



/* Auto-added Developer UI */

renderDeveloperUI() {

  const container = document.createElement("div");

  container.style.padding = "12px";

  container.style.marginBottom = "12px";

  container.style.background = "var(--card-bg)";

  container.style.borderRadius = "12px";

  container.style.boxShadow = "var(--shadow)";



  container.innerHTML = \`

    <strong>Developer Controls</strong><br><br>

    <label>Theme:

      <select id="devThemeSelect">

        <option value="light">Light</option>

        <option value="dark">Dark</option>

      </select>

    </label>

    <br><br>

    <label>Accent Color:

      <input type="color" id="devAccentPicker" value="#3060ff" />

    </label>

  \`;



  // Apply theme

  container.querySelector("#devThemeSelect").onchange = (e) => {

    document.documentElement.setAttribute("data-theme", e.target.value);

  };



  // Apply accent

  container.querySelector("#devAccentPicker").onchange = (e) => {

    document.documentElement.style.setProperty("--accent", e.target.value);

  };



  this.shadowRoot.prepend(container);

}

`

  );

});



console.log("\n✨ All patches applied. You may now run:");

console.log("   cd widget && npm run build\n");
