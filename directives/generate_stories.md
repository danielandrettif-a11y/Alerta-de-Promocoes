# Directive: Instagram Stories Image Generator

This Standard Operating Procedure (SOP) automatically generates high-quality vertical images (1080x1920px) for Instagram Stories using scraped deals from Mercado Livre.

## Goal
Convert JSON product promotions data into visually appealing, professional Instagram Story images ready for publishing. Each image includes a placeholder highlighting the optimal position for the Instagram Link Sticker to enable affiliate commission tracking.

## Inputs
- `DEALS_JSON_PATH` (string, optional): Path to the source deals JSON file. Default: `mercado_livre_deals_report.json`
- `TEMPLATE_PATH` (string, optional): Path to the HTML/CSS template. Default: `execution/story_template.html`
- `OUTPUT_DIR` (string, optional): Directory where the output images will be stored. Default: `stories`

## Execution Tools
- Script: `execution/generate_stories.js`
- Template: `execution/story_template.html`
- Native requirements: Google Chrome or Microsoft Edge installed on the local system (detected automatically).
- NPM library dependencies: `puppeteer-core`

## Output
A set of vertical JPEG images (format: `story_[RANK]_discount_[PERCENT].jpg`) generated inside the `/stories/` folder, configured at 1080x1920px. Each image displays:
- Super Discount Badge (e.g. 70% OFF)
- Clean cropped product image
- Rating stars and sales information
- Product title
- Slashed original price vs. glowing current promo price
- Alternating background watermark rows: page name, then lines with `AD`
- Elegant visual cues pointing down to where the link sticker should be placed.
