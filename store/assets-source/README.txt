Back to arXiv — store artwork sources

popup-en.png and popup-zh-CN.png are authentic v0.5.1 extension popup captures
from the browser integration suite. The artwork displays these captures as
images without changing their contents. HTML files in this folder are generated
by scripts/store-assets.mjs and provide the surrounding layout and copy.

Regenerate the store graphics after npm run build:

CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/store-assets.mjs

The script uses a temporary headless browser and copies the current 128px icon
from dist/icons. It runs with the saved capture files, independently of the
test-results directory. To intentionally refresh the captures after running
the browser integration suite, append --refresh-captures.

Outputs in store/assets:
- showcase-en.png: English listing screenshot, 1280 x 800, opaque RGB PNG.
- showcase-zh-CN.png: Simplified Chinese listing screenshot, 1280 x 800, opaque RGB PNG.
- promo-small.png: small promotional tile, 440 x 280, opaque RGB PNG.
- icon-128.png: current extension/store icon, 128 x 128, PNG with transparency.
