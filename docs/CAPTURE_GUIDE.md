# 📸 How to Capture Demo Screenshots & Video

## Screenshots (for README)

1. **Start the application** (both backend and frontend)
2. Open `http://localhost:5173` in your browser
3. Capture these 3 screenshots:

### Screenshot 1: Main Dashboard (`dashboard.png`)
- Show the full app — sidebar + graph + header
- Make sure some files are loaded and the graph shows colored nodes
- Use `Win + Shift + S` to capture

### Screenshot 2: Sidebar Clusters (`sidebar.png`)  
- Click on 2-3 cluster card headers to expand them
- Capture just the sidebar area showing expanded cluster cards with files

### Screenshot 3: Tooltip (`tooltip.png`)
- Hover over a node in the graph
- Capture the tooltip popup showing file metadata

### Save all screenshots to this `docs/` folder.

---

## Demo Video

### Option 1: Windows Game Bar
1. Press `Win + G` to open Game Bar
2. Click the record button (or `Win + Alt + R`)
3. Demo the app:
   - Show the graph visualization
   - Hover over nodes to show tooltips
   - Drag nodes around
   - Upload a new file via the upload zone
   - Watch it auto-cluster in real-time
4. Stop recording — save as `docs/demo.mp4`

### Option 2: OBS Studio (Free)
1. Download from https://obsproject.com/
2. Set up a screen capture source
3. Record the same demo flow as above
4. Export as MP4 to `docs/demo.mp4`

### Option 3: Upload to YouTube
1. Record using any method
2. Upload to YouTube
3. Replace the demo video link in README.md with your YouTube URL

---

## After Capturing

Update the image paths in `README.md` if needed:
```markdown
![SEFS Main Dashboard](docs/dashboard.png)
![Sidebar Clusters](docs/sidebar.png)
![File Tooltip](docs/tooltip.png)
```
