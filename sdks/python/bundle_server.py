#!/usr/bin/env python3
"""
Bundle pmxt-core server files into the Python package.

This script copies the server files from the core package into the Python
package so that users only need to run `pip install pmxt` without needing
to separately install Node.js dependencies.
"""

import shutil
from pathlib import Path
import sys


def bundle_server():
    """Copy pmxt-core server files into Python package."""
    
    # Paths
    script_dir = Path(__file__).parent
    core_dir = script_dir.parent.parent / 'core'
    target_dir = script_dir / 'pmxt' / '_server'
    
    # Verify core directory exists
    if not core_dir.exists():
        print(f"Error: core directory not found at {core_dir}", file=sys.stderr)
        print("This script must be run from the monorepo structure", file=sys.stderr)
        return False
    
    # Verify built server exists
    server_dist = core_dir / 'dist' / 'server'
    bundled_server = server_dist / 'bundled.js'
    
    if not bundled_server.exists():
        print(f"Error: Bundled server not found at {bundled_server}", file=sys.stderr)
        print("Please run 'npm run build && npm run bundle:server' in core/", file=sys.stderr)
        return False
    
    bin_dir = core_dir / 'bin'
    if not bin_dir.exists():
        print(f"Error: bin directory not found at {bin_dir}", file=sys.stderr)
        return False
    
    # Create target directory
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy bundled server (single file, ~3MB)
    print(f"Copying bundled server from {bundled_server}...")
    server_target = target_dir / 'server'
    server_target.mkdir(exist_ok=True)
    shutil.copy(bundled_server, server_target / 'bundled.js')
    
    # Copy bin
    print(f"Copying bin from {bin_dir} to {target_dir / 'bin'}...")
    if (target_dir / 'bin').exists():
        shutil.rmtree(target_dir / 'bin')
    shutil.copytree(bin_dir, target_dir / 'bin')
    
    # Clean up any extra files in server directory (we only need bundled.js)
    for item in server_target.iterdir():
        if item.name != 'bundled.js' and item.name != '__pycache__':
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    
    # Create __init__.py to make it a package
    (target_dir / '__init__.py').touch()
    return True


if __name__ == '__main__':
    success = bundle_server()
    sys.exit(0 if success else 1)
