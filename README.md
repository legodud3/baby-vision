# baby-vision v0.1

Privacy-first static web app that simulates infant visual development on-device.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` and allow camera access.

## Modes

- `Live`
  - Split viewfinder (`ADULT` and `BABY`)
  - Age slider (0-12 months)
  - `Capture To Photo` sends current live frame into photo mode
  - `Save Split PNG` exports a 1080x1920 split image
- `Photo`
  - Upload from library/camera using the button inside the Original card
  - Compact left Original preview + compact right 2x3 simulated grid (0, 1, 3, 6, 9, 12 months)
  - Mobile stacks source and grid

## Notes

- All processing is local in the browser.
- No backend/API dependencies.
- Current simulation is a PRD-driven heuristic approximation (blur, saturation, contrast, warm tint), not a medical-grade vision model.

## Files

- `index.html`: app structure and screen layout
- `style.css`: ultra-clean responsive UI
- `app.js`: camera flow, mode switching, simulation rendering
