#!/usr/bin/env python3
"""
Widget Fixes - Auto-Apply Script
Finds and fixes all three widget issues automatically.
"""

import os
import re
import sys
from pathlib import Path

def find_project_root():
    """Find the SINNA1.0 project root directory."""
    # Check current directory
    if os.path.exists("widget/src/SinnaPresetBase.js"):
        return Path(".")
    
    # Check parent directory
    if os.path.exists("../widget/src/SinnaPresetBase.js"):
        return Path("..")
    
    # Search in common locations
    search_paths = [
        Path.home() / "Library" / "Mobile Documents" / "com~apple~CloudDocs",
        Path.home() / "Documents",
        Path("/Users/ikennaokeke/Documents"),
    ]
    
    for base_path in search_paths:
        if not base_path.exists():
            continue
        for root, dirs, files in os.walk(base_path):
            if "SinnaPresetBase.js" in files and "widget/src" in root:
                return Path(root).parent.parent
    
    return None

def fix_header_text(file_path):
    """Fix 1: Update header text in SinnaPresetBase.js"""
    print(f"✅ Fix 1: Updating header text in {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Create backup
    backup_path = str(file_path) + '.bak'
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Replace header text
    content = content.replace('Sinna Accessibility Presets', 'SINNA 1.0')
    content = content.replace('Select a preset to analyze your video', 'Accessibility, Automated')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Header text updated (backup: {backup_path})")
    return True

def fix_demo_paths(file_path):
    """Fix 2: Fix demo paths in index.html"""
    print(f"✅ Fix 2: Fixing demo paths in {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Create backup
    backup_path = str(file_path) + '.bak'
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    # Replace paths
    content = content.replace("'../dist/dev-widget.js'", "'/dist/dev-widget.js'")
    content = content.replace('"../dist/dev-widget.js"', '"/dist/dev-widget.js"')
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"✓ Demo paths fixed (backup: {backup_path})")
    return True

def verify_dev_widget(file_path):
    """Fix 3: Verify dev widget controls"""
    print(f"✅ Fix 3: Verifying dev widget controls in {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    has_render = 'renderDeveloperUI' in content
    has_theme = 'dev-theme-toggle' in content
    has_accent = 'dev-accent-color' in content
    
    if has_render and has_theme and has_accent:
        print("✓ Dev widget controls present")
        return True
    else:
        print("⚠ Dev widget controls may be missing:")
        if not has_render:
            print("  - Missing renderDeveloperUI() method")
        if not has_theme:
            print("  - Missing dev-theme-toggle")
        if not has_accent:
            print("  - Missing dev-accent-color")
        return False

def main():
    print("🔧 Applying Widget Fixes...")
    print("")
    
    # Find project root
    project_root = find_project_root()
    if not project_root:
        print("❌ Could not find widget files")
        print("Please run this from your SINNA1.0 directory")
        sys.exit(1)
    
    print(f"📁 Project root: {project_root.absolute()}")
    print("")
    
    os.chdir(project_root)
    
    # Fix 1: Header text
    preset_base = Path("widget/src/SinnaPresetBase.js")
    if preset_base.exists():
        fix_header_text(preset_base)
    else:
        print(f"⚠ {preset_base} not found")
    print("")
    
    # Fix 2: Demo paths
    demo_html = Path("widget/demo/index.html")
    if demo_html.exists():
        fix_demo_paths(demo_html)
    else:
        print(f"⚠ {demo_html} not found")
    print("")
    
    # Fix 3: Verify dev widget
    preset_dev = Path("widget/src/SinnaPresetDev.js")
    if preset_dev.exists():
        verify_dev_widget(preset_dev)
    else:
        print(f"⚠ {preset_dev} not found")
    print("")
    
    print("✅ Fixes applied! Backup files created with .bak extension")
    print("")
    print("Next steps:")
    print("  cd widget")
    print("  npm run build")
    print("  npm run preview")

if __name__ == "__main__":
    main()

