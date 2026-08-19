Below is a **comprehensive product-design prompt** you can use with **UI/UX tools (Figma AI, Framer AI, v0.dev, Lovable, or any design/code generator)** to build the **Maize Intelligence System frontend**.
It captures **all the flows we discussed**: upload, draw on map, farm detection, maize verification, cluster looping, large-area scanning, health gradient, yield prediction, and confidence display.

---

# Prompt: Design the Maize Intelligence System Web Application

Design a **modern, intuitive geospatial web application** called **Maize Intelligence System** that allows users to upload or draw farm boundaries on a map to analyze maize farms and predict crop yield.

The platform should be **clean, professional, and simple to use**, even for non-technical agricultural users.

The design should focus on **clarity, transparency of results, and map-based interaction**.

---

# Overall Application Purpose

The system allows users to:

1. Upload farm boundaries or draw farms on a map.
2. Verify whether the farm contains maize using a classification model.
3. Display the **confidence/accuracy percentage** of the maize identification.
4. Run a **yield prediction model** for verified maize farms.
5. Display **farm health status using gradient colors**.
6. Show **yield predictions as discrete values**.
7. Automatically detect maize farms when a **large area is uploaded or drawn**.

The interface should be **map-centered**, with side panels and result cards.

---

# Main User Flow

The application has **four primary stages**:

1. Farm Input (Upload or Draw)
2. Geometry Validation
3. Maize Verification
4. Prediction Results

Each stage should have clear UI feedback and transitions.

---

# Screen 1 — Start Screen

This is the entry point of the application.

Display two large action cards:

**Option 1: Upload Farm Data**

Description:
Upload farm boundaries or an area for maize analysis.

Supported file formats:

* GeoJSON
* KML / KMZ
* Shapefile (ZIP)
* CSV with coordinates

**Option 2: Draw on Map**

Description:
Draw your farm or an area directly on the map.

Users can create boundaries interactively.

The layout should be minimal and welcoming.

---

# Screen 2 — Map Workspace (Upload / Drawing Interface)

The workspace contains:

**A large interactive map** in the center.

**A left or right control panel** for actions.

### Map Capabilities

The map should allow:

* Zoom
* Pan
* Polygon drawing
* Polygon editing
* Vertex adjustment
* Delete polygon
* Undo last point

---

# Farm Input Options

Users must choose one of three farm input modes.

---

# Mode 1 — Single Farm Boundary

The user provides **one farm polygon**.

This can be done by:

* Uploading a single boundary file
* Drawing a single polygon on the map

System behavior:

1. Display the boundary on the map.
2. Calculate farm area (hectares or acres).
3. Run maize classification for that polygon.

Result displayed:

* Maize Status
* Confidence percentage

Example display:

Maize detected — 92% confidence

If maize is detected above the threshold, allow yield prediction.

---

# Mode 2 — Multiple Farm Boundaries (Cluster Upload)

The user uploads a dataset containing **multiple farm polygons**.

System behavior:

1. Render all farms on the map.
2. Create a farm list panel.
3. Loop through each farm polygon and run maize classification.

For each farm show:

* Farm label
* Maize status
* Confidence percentage

Example list:

Farm 01 — Maize — 89% confidence
Farm 02 — Not maize — 62% confidence
Farm 03 — Maize — 94% confidence

Only maize farms proceed to prediction.

---

# Mode 3 — Large Area Upload (Area of Interest)

The user uploads a boundary that covers a **large region** rather than a specific farm.

Example:

A district, large farmland region, or agricultural zone.

System behavior:

1. Run maize classification across the entire area.
2. Identify maize crop patches.
3. Convert maize patches into farm polygons.
4. Label them automatically.

Example labels:

Detected Farm 1
Detected Farm 2
Detected Farm 3

Display detected farms on the map.

Show a message:

"We detected 12 maize farms in this area."

Each detected farm polygon must display maize confidence.

---

# Draw on Map Feature

Users must also be able to **draw boundaries directly on the map**.

Drawing tools include:

* Draw polygon
* Edit polygon
* Move vertices
* Delete polygon
* Undo last point
* Clear drawing

Users can draw:

1. A **single farm**
2. **Multiple farms**
3. A **large area for scanning**

These correspond exactly to the three upload modes.

---

# Geometry Validation

Before analysis begins, the system validates the geometry.

Validation checks:

* Polygon is closed
* No overlapping edges
* No self-intersections
* Area size within supported limits

If the boundary is invalid:

Display an error message:

"Invalid boundary detected. Please adjust the polygon."

Highlight problematic edges if possible.

---

# Maize Verification Layer

After geometry validation, the system runs a **maize classification algorithm**.

For every polygon, display:

Maize Status

Possible values:

* Maize
* Not Maize
* Uncertain

Confidence percentage must always be shown.

Example:

Maize — 91% confidence

This transparency is essential.

---

# Decision Threshold Logic

Prediction is allowed based on confidence.

Example logic:

Confidence ≥ 70%

Farm is considered maize.

Prediction automatically runs.

Confidence 40–69%

Status uncertain.

User may choose:

"Run prediction anyway"

Confidence < 40%

Farm is considered not maize.

Prediction disabled unless overridden.

---

# Prediction Layer

Prediction runs only for maize farms.

Two outputs must be displayed.

---

# Output 1 — Farm Health Status

Farm health must be displayed visually using a **color gradient overlay on the map**.

Color scale example:

Red = Poor health
Yellow = Moderate health
Green = Good health

Each farm also shows a simple label:

Poor
Moderate
Good
Excellent

---

# Output 2 — Yield Prediction

Yield must be displayed as a **discrete numeric value**.

Examples:

3.4 tons per hectare
12 bags per acre

This value should appear in:

* Farm popup card
* Farm list panel

---

# Map Visualization Rules

Detected farms appear as polygons.

Health is displayed using gradient color fill.

Selected farm highlights with:

* Bold outline
* Information popup

Popup card displays:

Farm ID
Maize confidence
Health status
Predicted yield

---

# Results Dashboard

After prediction, users see a **results dashboard**.

Components:

Interactive map with health gradients.

Farm summary panel listing:

Farm name
Maize confidence
Health status
Predicted yield

Users can click farms to view detailed cards.

Sorting options:

Sort by health
Sort by yield
Sort by confidence

---

# UI Design Style

The interface should feel:

* Modern
* Clean
* Geospatially focused
* Easy to understand for farmers and analysts

Design inspiration:

Modern GIS dashboards and agricultural intelligence tools.

The map must be the central experience.

Side panels should contain analysis results.

Use simple icons, readable typography, and minimal clutter.

---

# Final User Experience Summary

The application should feel extremely simple.

User journey:

Upload or draw a farm.

The system verifies if the crop is maize.

Users see the confidence level.

The system predicts yield and farm health.

Results appear visually on the map.

---

If you'd like, I can also help you create the **next two critical pieces for development**:

1️⃣ **Frontend component architecture** (React/Next.js or Flutter widgets)
2️⃣ **Backend API contract** for all flows (upload, draw, detect farms, prediction) so your frontend integrates cleanly.
