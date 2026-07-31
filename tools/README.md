# tools

Development harnesses. Not part of the site — nothing in `src/` imports them.

    npm i playwright
    python3 -m http.server 8099 &
    node tools/qa.mjs            # full sweep: all 50 rooms, links, keyboard, search
    node tools/qa.mjs --shots    # also writes tools/rooms/<roomId>.png
    node tools/shot.mjs cellar out.png 1600 1000

`EXE` at the top of each script points at the bundled Chromium; change it if
your Playwright browsers live elsewhere. Don't edit files in `src/` while the
sweep is running — a mid-run reload produces failures that aren't real.
