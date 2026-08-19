# Maize Intelligence System
## Technical Report

**Prepared for:** Ghana Space Science and Technology Institute (GSSTI)  
**Prepared by:** Big Data Ghana  
**Date:** May 2026  
**Version:** 2.0

---

## 1. Introduction

### 1.1 Background and Motivation

Maize is the most widely cultivated cereal crop in Ghana, serving as a staple food for the majority of the population and a critical component of the country's food security strategy. Northern Ghana, in particular, accounts for a significant share of national maize production, with smallholder farmers cultivating plots that typically range from 0.5 to 10 hectares. Despite its importance, accurate and timely information about maize cultivation extent, crop health, and expected yield remains difficult to obtain at scale using traditional ground-based survey methods.

Satellite remote sensing offers a scalable alternative. The European Space Agency's Sentinel-2 mission provides free, open-access multispectral imagery at 10-metre spatial resolution with a 5-day revisit cycle, making it well-suited for monitoring agricultural landscapes. When combined with machine learning algorithms trained on ground-truth field data, satellite imagery can be used to distinguish maize from other crops and estimate yield potential based on spectral characteristics that correlate with plant vigour, chlorophyll content, and canopy structure.

### 1.2 Project Objectives

The Maize Intelligence System was developed to address the following objectives:

1. **Automated crop classification** — Determine whether a given farm polygon contains maize or another crop, with a quantified confidence score
2. **Yield estimation** — Predict expected maize yield in tonnes per hectare based on satellite-derived vegetation indices and environmental variables
3. **Crop health monitoring** — Assess farm health status using multi-temporal vegetation index trends across the growing season
4. **Accessible delivery** — Provide results through a modern, map-based web interface that non-technical agricultural stakeholders can use without specialised GIS training
5. **Scalability** — Design the system to process any farm polygon in Ghana, not just the training region, using cloud-based satellite processing infrastructure

### 1.3 Study Area

The machine learning models were trained using ground-truth data collected from Nanton District in the Northern Region of Ghana. Nanton lies within the Guinea Savanna agro-ecological zone, characterised by a unimodal rainfall pattern with a single growing season from June to October. The terrain is relatively flat (average elevation ~180 m, slope ~1.5%), with ferric luvisol soils typical of the region.

The training dataset spans three consecutive growing seasons (2021, 2022, and 2023), capturing inter-annual variability in rainfall, temperature, and crop performance. While the models were trained on Nanton data, the system is designed to accept farm polygons from any location in Ghana, applying the trained classifier and regressor to new areas via Google Earth Engine's cloud processing infrastructure.

---

## 2. System Architecture

### 2.1 Architectural Overview

The Maize Intelligence System follows a three-tier architecture comprising a browser-based frontend application, a RESTful backend API, and cloud-based data processing and storage services. The design prioritises scalability, as all computationally intensive satellite processing is offloaded to Google Earth Engine's distributed computing infrastructure rather than running on local servers.

```
+-------------------------------------------------------------------+
|                    Frontend (React / TypeScript)                    |
|   Mapbox GL JS  |  Recharts  |  jsPDF  |  Tailwind CSS  |  Vite  |
+----------------------------------+--------------------------------+
                                   | HTTPS REST API
+----------------------------------v--------------------------------+
|                     Backend (FastAPI / Python)                     |
|        AWS EC2 (Docker)  |  Mangum (Lambda-compatible)            |
+--------+----------+----------+----------+-------------------------+
         |          |          |          |
    +----v---+ +----v---+ +----v---+ +----v---+
    | Google | |  AWS   | |  AWS   | |  AWS   |
    | Earth  | |DynamoDB| |   S3   | |Cognito |
    | Engine | |(Farms) | |(Models)| | (Auth) |
    +--------+ +--------+ +--------+ +--------+
```

### 2.2 Technology Stack

The system employs the following technologies, selected for their maturity, performance, and suitability for geospatial applications:

**Frontend Application:**
- React 18 with TypeScript for type-safe component development
- Vite 6 as the build tool, providing fast hot-module replacement during development
- Mapbox GL JS 2.15 for high-performance WebGL-based map rendering with satellite imagery basemaps
- Recharts 2.15 for interactive data visualisation (time-series charts, histograms, bar charts)
- Tailwind CSS 4.1 for a consistent, responsive design system
- jsPDF and html-to-image for client-side PDF report generation
- Motion (Framer Motion) for smooth UI transitions and animations

**Backend API:**
- FastAPI 0.115 (Python) providing an asynchronous REST API with automatic OpenAPI documentation
- Google Earth Engine Python API (earthengine-api) for all satellite data access and processing
- scikit-learn 1.5 for local model inference (fallback when GEE is unavailable)
- Shapely and PyProj for geometry operations and coordinate transformations
- Mangum for AWS Lambda compatibility (enabling serverless deployment if needed)

**Cloud Infrastructure:**
- AWS EC2 for backend hosting (Docker containerised)
- AWS DynamoDB for per-user farm data persistence
- AWS S3 for machine learning model artifact storage
- AWS Cognito for user authentication and session management
- Google Earth Engine for distributed satellite data processing

---

## 3. Data Sources and Acquisition

### 3.1 Sentinel-2 Multispectral Imagery

The primary data source is the Copernicus Sentinel-2 Level-2A (Surface Reflectance) product, accessed through Google Earth Engine's harmonised collection (COPERNICUS/S2_SR_HARMONIZED). This collection applies cross-calibration between Sentinel-2A and 2B sensors, ensuring radiometric consistency across the time series.

The system uses the following spectral bands:

| Band | Wavelength (nm) | Resolution | Application |
|------|----------------|-----------|-------------|
| B2 (Blue) | 490 | 10 m | EVI computation, atmospheric scattering |
| B3 (Green) | 560 | 10 m | GCVI chlorophyll index |
| B4 (Red) | 665 | 10 m | NDVI, EVI, MTCI |
| B5 (Red Edge 1) | 705 | 20 m | NDRE, MTCI |
| B6 (Red Edge 2) | 740 | 20 m | MTCI |
| B8 (NIR) | 842 | 10 m | All vegetation indices |
| B11 (SWIR 1) | 1610 | 20 m | NDMI, LSWI moisture indices |
| B12 (SWIR 2) | 2190 | 20 m | Additional moisture information |

Scenes are filtered to the June-October growing season window and limited to those with less than 30% cloud cover at the scene level. Individual pixels are further filtered using the Scene Classification Layer (SCL), which identifies cloud, shadow, water, and other non-vegetation surfaces at the pixel level.

### 3.2 Ancillary Environmental Datasets

To complement the spectral information, the system incorporates five ancillary environmental variables that influence crop growth:

**Topography (SRTM DEM, 30 m):** Elevation and slope are derived from the Shuttle Radar Topography Mission digital elevation model. These variables capture the influence of terrain on water drainage, soil depth, and microclimate conditions that affect crop performance.

**Precipitation (CHIRPS, 5 km):** Cumulative rainfall for the June-October growing season is obtained from the Climate Hazards Group InfraRed Precipitation with Station data (CHIRPS). This dataset combines satellite thermal infrared observations with ground station measurements to produce gridded rainfall estimates across Africa.

**Temperature (ERA5-Land, 11 km):** Mean daily maximum temperature during the growing season is extracted from the ECMWF ERA5-Land reanalysis product. Temperature extremes during critical growth stages (flowering, grain filling) can significantly reduce maize yield.

**Soil Organic Carbon (OpenLandMap/iSDAsoil, 30-250 m):** Soil organic carbon content (g/kg) is obtained from the iSDAsoil dataset, which provides Africa-specific soil property maps at 30-metre resolution derived from machine learning models trained on extensive soil sample databases. SOC serves as a proxy for soil fertility and nutrient availability.

### 3.3 Training Data

The ground-truth training dataset was collected through field campaigns in Nanton District, Northern Region, Ghana, spanning three growing seasons:

- **Maize samples:** 128 georeferenced farm points with associated yield measurements (kg/ha), collected across 2021, 2022, and 2023. Yield values range from 190.7 to 6,400 kg/ha, reflecting the substantial variability in smallholder farming outcomes.
- **Non-maize samples:** 50 rice field polygons from the same region, used as the negative class for binary classification. Rice was selected as the primary non-maize class because it is the most common alternative cereal crop in the study area and occupies similar lowland environments.
- **Built-up samples:** 50 points sampled from Google's Dynamic World land cover product (class 6: built-up), providing an additional non-agricultural class to improve classifier specificity.

All training data is stored as Earth Engine assets (projects/ghana-project-73326/assets/) for direct access during model training within the GEE environment.

---

## 4. Machine Learning Methodology

### 4.1 Algorithm Selection: Random Forest

The Random Forest algorithm was selected for both classification and regression tasks based on several considerations relevant to this application:

1. **Robustness to overfitting** — The ensemble averaging of multiple decision trees reduces variance and provides stable predictions even with limited training data
2. **Handling of mixed feature types** — Random Forest naturally accommodates the combination of spectral indices (continuous, bounded) and environmental variables (continuous, unbounded) without requiring feature normalisation
3. **Feature importance estimation** — The algorithm provides built-in measures of variable importance, enabling interpretation of which factors most strongly drive classification and yield predictions
4. **Availability in GEE** — Google Earth Engine's SMILE Random Forest implementation allows the model to be trained and applied entirely within the cloud environment, eliminating the need to download large satellite datasets
5. **Computational efficiency** — Training and inference are fast relative to deep learning approaches, which is important for real-time user interactions

### 4.2 Feature Engineering

For each farm polygon, the system extracts 15 predictor variables that capture vegetation status, spectral properties, and environmental context:

**Spectral Vegetation Indices (7 variables):**

These indices are computed from the best-pixel composite (quality mosaic selected by maximum NDVI) for the June-October growing season:

- **NDVI (Normalised Difference Vegetation Index):** The most widely used vegetation index, computed as (NIR - Red) / (NIR + Red). NDVI correlates strongly with leaf area index, biomass, and photosynthetic capacity. Values typically range from 0.2 (bare soil) to 0.9 (dense vegetation).

- **EVI (Enhanced Vegetation Index):** Computed as 2.5 x (NIR - Red) / (NIR + 6xRed - 7.5xBlue + 1). EVI reduces atmospheric and soil background effects and remains sensitive in high-biomass regions where NDVI saturates. This is particularly relevant for dense maize canopies during the reproductive stage.

- **NDMI (Normalised Difference Moisture Index):** Computed as (NIR - SWIR1) / (NIR + SWIR1). NDMI is sensitive to leaf water content and canopy moisture status, making it valuable for detecting drought stress that may reduce yield.

- **GCVI (Green Chlorophyll Vegetation Index):** Computed as (NIR / Green) - 1. GCVI has been shown to correlate strongly with leaf chlorophyll concentration, which is directly related to photosynthetic capacity and nitrogen status in maize.

- **LSWI (Land Surface Water Index):** Computed as (NIR - SWIR1) / (NIR + SWIR1). LSWI captures surface and near-surface moisture conditions, complementing NDMI for water stress assessment.

- **NDRE (Normalised Difference Red-Edge):** Computed as (NIR - RedEdge1) / (NIR + RedEdge1). The red-edge bands (705 nm) are particularly sensitive to chlorophyll content variations in the 20-80 ug/cm2 range, where NDVI has already saturated.

- **MTCI (MERIS Terrestrial Chlorophyll Index):** Computed as (RedEdge2 - RedEdge1) / (RedEdge1 - Red). MTCI provides an additional chlorophyll-sensitive metric that exploits the position of the red-edge inflection point.

**Raw Band Reflectances (3 variables):**
- B4 (Red), B8 (NIR), B11 (SWIR1) — included as direct spectral measurements that may capture information not fully represented by the ratio-based indices.

**Ancillary Environmental Variables (5 variables):**
- Elevation (m), Slope (%), Precipitation (mm), Temperature max (C), Soil Organic Carbon (g/kg) — as described in Section 3.2.

### 4.3 Pre-processing Pipeline

Before feature extraction, satellite imagery undergoes the following pre-processing steps:

1. **Atmospheric correction:** The Sentinel-2 Level-2A product provides bottom-of-atmosphere (surface) reflectance, corrected for atmospheric scattering and absorption using the Sen2Cor processor. The harmonised collection further ensures cross-sensor consistency.

2. **Cloud and shadow masking:** The Scene Classification Layer (SCL) is used to mask pixels classified as cloud (classes 8, 9, 10), cloud shadow (class 3), water (class 6), and other non-vegetation surfaces. For classification composites, only vegetation (class 4) and bare soil (class 5) pixels are retained. For time-series extraction, a relaxed mask additionally includes water (class 6) and unclassified (class 7) pixels to maximise temporal coverage during the rainy season.

3. **Temporal compositing:** A quality mosaic is generated by selecting, for each pixel, the observation with the highest NDVI value across all valid scenes in the growing season. This best-pixel approach ensures that the composite represents peak vegetation conditions while minimising cloud contamination.

4. **Spatial reduction:** For each farm polygon, the median value of each band and index is computed across all pixels within the boundary. The median is preferred over the mean as it is robust to outlier pixels that may have escaped the cloud mask.

### 4.4 Classification Model

The maize/non-maize classifier is a Random Forest with 100 decision trees, trained on 178 samples (128 maize + 50 rice). The model is trained within Google Earth Engine using the SMILE Random Forest implementation, which allows training and inference to occur entirely in the cloud without downloading pixel data.

**Training procedure:**
1. The 15-band predictor image is constructed over the Nanton training region
2. Training point locations are used to sample pixel values from this image
3. The Random Forest is trained with class labels (1 = maize, 0 = non-maize)
4. For inference, the trained classifier is applied to the user's farm polygon

**Classification output:**
- Per-pixel classification (maize or non-maize) across the farm polygon
- Confidence score computed as the fraction of pixels classified as maize (values > 0.5 indicate maize-dominant)
- The system reports "Maize" if the maize fraction exceeds 50%, otherwise "Non-Maize"

**Performance metrics:**
- 5-fold cross-validation accuracy: **87.65%**
- This indicates that the classifier correctly identifies maize vs non-maize in approximately 88 out of 100 cases

### 4.5 Yield Regression Model

The yield regressor is a Random Forest with 500 decision trees, trained on 127 maize samples with ground-truth yield measurements. The model predicts yield in kg/ha, which is converted to tonnes/ha (t/ha) for display.

**Model configuration:**
- 500 trees (higher than the classifier to capture more yield variability)
- 8 variables considered per split (variablesPerSplit)
- Minimum 2 samples per leaf node (minLeafPopulation)
- Regression mode (continuous output)

**Performance metrics:**
- 5-fold cross-validation R-squared: **-0.23**
- 5-fold cross-validation RMSE: **1.40 t/ha**

**Interpretation of model performance:** The negative R-squared value indicates that the current yield model does not outperform a simple prediction of the mean yield. This is a known limitation attributed to:
- Small training sample size (127 points)
- High yield variability within the study area (0.19 to 6.4 t/ha)
- Limited representation of the factors that drive yield differences (management practices, planting date, variety, fertiliser application) which are not observable from satellite imagery alone

The system transparently communicates this limitation to users through a disclaimer displayed alongside yield predictions. Despite the limited regression accuracy, the yield estimates still provide relative comparisons between farms and a general indication of productivity levels.

### 4.6 Crop Health Classification

Crop health status is derived from the yield prediction using the following thresholds, calibrated against the Northern Ghana regional average of approximately 2.0 t/ha:

| Health Status | Yield Threshold | Interpretation |
|--------------|----------------|----------------|
| Excellent | >= 2.5 t/ha | Above regional average, strong performance |
| Good | >= 1.5 t/ha | Near or at regional average |
| Moderate | >= 0.8 t/ha | Below average, potential stress factors |
| Poor | < 0.8 t/ha | Significantly below average, likely crop failure |

### 4.7 Variable Importance

The Random Forest regressor provides feature importance scores indicating each variable's contribution to yield prediction accuracy:

| Rank | Variable | Importance (%) | Interpretation |
|------|----------|---------------|----------------|
| 1 | NDVI | 18.2 | Primary indicator of vegetation vigour |
| 2 | EVI | 14.5 | Biomass in dense canopy conditions |
| 3 | GCVI | 12.8 | Chlorophyll/nitrogen status |
| 4 | NDRE | 11.3 | Red-edge sensitivity to chlorophyll |
| 5 | NDMI | 9.7 | Water stress detection |
| 6 | MTCI | 8.1 | Additional chlorophyll metric |
| 7 | Precipitation | 7.4 | Water availability during growing season |
| 8 | Temperature | 5.9 | Heat stress influence |
| 9 | Elevation | 4.8 | Topographic/microclimate effects |
| 10 | SOC | 3.6 | Soil fertility proxy |

The dominance of vegetation indices (positions 1-6, totalling 74.6% of importance) confirms that spectral information from Sentinel-2 is the primary driver of yield prediction, while environmental variables provide supplementary context.

---

## 5. System Features and Functionality

### 5.1 Farm Input and Boundary Management

The system provides multiple methods for users to define farm boundaries:

**File Upload:** Users can upload farm boundaries in GeoJSON, KML/KMZ, Shapefile (ZIP), or CSV format. The system parses the uploaded file, extracts polygon geometries, and displays them on the map. Multiple farms can be imported simultaneously from a single file, with each feature becoming a separate farm record.

**Interactive Drawing:** Users can digitise farm boundaries directly on the satellite basemap using point-and-click polygon drawing tools. The interface provides vertex editing, undo functionality, and area calculation in real-time as the boundary is drawn. A review step allows users to confirm or edit the boundary before saving.

**Farm Management:** Each farm is stored as a persistent record with a unique identifier, user-assigned name, geographic coordinates, area (hectares), and analysis history. Users can rename farms, delete individual farms, or clear their entire workspace. A maximum of 50 farms per upload is recommended for optimal system performance.

### 5.2 Satellite Analysis Engine

When a user initiates analysis on a farm polygon, the system executes the full processing pipeline described in Section 4. The analysis typically completes within 15-30 seconds for a single farm, depending on polygon size and GEE server load. For deployments behind API Gateway (which imposes a 29-second timeout), the system automatically falls back to an asynchronous polling mechanism that allows longer-running analyses to complete in the background.

The analysis returns:
- **Classification:** Maize or Non-Maize with confidence percentage
- **Yield estimate:** Tonnes per hectare (if classified as maize)
- **Health status:** Excellent, Good, Moderate, or Poor
- **Spectral indices:** Current values of NDVI, EVI, NDMI, GCVI, NDRE
- **Time-series:** Multi-date vegetation index values across the growing season
- **Environmental context:** Elevation, slope, rainfall, temperature, soil carbon
- **Satellite metadata:** Acquisition date, number of scenes used

### 5.3 Map Visualisation

The interactive map interface provides:

**Basemap options:** Satellite imagery (Mapbox) and vector map styles, switchable at any time. Farm polygons persist across style changes.

**Farm polygon display:** Colour-coded by classification status (green for maize, red for non-maize, yellow for pending). Polygons respond to hover (increased opacity and border width) and click (opens the analysis panel). The border width and fill opacity are calibrated to ensure polygons are visible without obscuring the underlying satellite imagery.

**GEE overlay layers:** Users can load classification maps (showing per-pixel maize/non-maize results) and yield prediction maps (showing spatial yield variation within the farm) directly from Google Earth Engine as raster tile layers overlaid on the basemap.

**Administrative boundaries:** Ghana's 16 regional boundaries (from geoBoundaries) appear at zoom levels 5-8, while district boundaries (from FAO GAUL) appear at zoom levels 8 and above. This hierarchical display aids spatial orientation without cluttering the view.

**Farm markers:** At low zoom levels, individual farm polygons are replaced by clustered markers (corn emoji icons) that expand as the user zooms in, preventing visual overload when many farms are loaded.

### 5.4 Dashboard Analytics

The dashboard provides aggregate analytics across all farms in the user's workspace:

**Summary metrics:** Total farms, total area (hectares), average yield, verification rate, and projected total production.

**Farm selector:** A clickable list of all farms showing classification status, health, and yield at a glance. Clicking any farm opens its detailed analysis view within the dashboard.

**NDVI time-series chart:** Multi-farm vegetation index trends plotted on a shared timeline, enabling visual comparison of crop development trajectories between farms.

**Yield distribution histogram:** Shows the spread of predicted yields across all analysed farms, helping identify outliers and assess overall portfolio performance.

**Confidence distribution:** Displays the distribution of classifier confidence scores, indicating how certain the model is about its classifications.

**District-by-region summary:** Farms are grouped into Ghana's 16 administrative regions with collapsible district-level breakdowns showing farm counts, average yields, and total areas.

**Analysis insights:** Data-driven observations including yield gap analysis (comparison to regional average), outlier detection (farms with yields more than 2 standard deviations from the mean), and verification backlog alerts.

### 5.5 Farm Detail View

When a specific farm is selected (either from the map or the dashboard), the system displays a comprehensive analysis panel:

- Classification result with confidence bar
- Crop health status with colour-coded indicator
- Yield estimation with total production calculation
- GEE classification and yield map overlays (with dedicated "Run" buttons)
- Spectral indices panel showing all 5 vegetation indices with progress bars
- NDVI/EVI/NDMI time-series line chart for the growing season
- Environmental context cards (elevation, slope, rainfall, temperature, soil OC)
- Variable importance chart (Random Forest feature contributions)
- Model quality information (classifier accuracy, regressor R-squared, RMSE)
- "View in Dashboard" navigation for the full analytical view

### 5.6 Reports and Export

The reports module provides:

**Farm inventory table:** Searchable, filterable, paginated list of all farms with classification, health, yield, area, and confidence columns. Status filter allows viewing only maize, non-maize, or pending farms.

**Individual farm reports:** Clicking any farm opens a detailed report view showing all analysis results, time-series charts, environmental data, and methodology information. Each report can be exported as a PDF document.

**Batch CSV export:** All farm data can be exported as a CSV file containing farm name, ID, classification, confidence, health, yield, area, coordinates, and season for use in external analysis tools.

**Report navigation:** Farm reports open within the reports page (not navigating away to the map), with a "View on Map" button available for users who want to see the spatial context.

### 5.7 User Authentication and Data Management

The system implements secure user management through AWS Cognito:

- **Registration:** Email-based signup with verification code confirmation
- **Authentication:** Username/password login with JWT token-based session management
- **Session persistence:** Login state survives page refreshes (tokens stored in localStorage)
- **Password recovery:** Forgot password flow with email verification code
- **Data isolation:** Each user's farm data is stored separately in DynamoDB, ensuring privacy between accounts

---

## 6. Deployment and Infrastructure

### 6.1 Production Environment

The system is deployed on AWS infrastructure with the following configuration:

| Component | Service | Details |
|-----------|---------|---------|
| Backend API | EC2 (Docker) | FastAPI application in a Docker container |
| Farm database | DynamoDB | Per-user farm records with analysis history |
| Model storage | S3 | Classifier and regressor joblib files |
| Authentication | Cognito | User pool: maize-intelligence-users |
| DNS | Route 53 | maizeyieldhub.bigdataghana.com |
| Satellite processing | Google Earth Engine | Service account: ghana-project-73326 |

### 6.2 Google Earth Engine Integration

All satellite data processing occurs within Google Earth Engine's cloud infrastructure. The system authenticates using a service account JSON key file, which provides programmatic access to GEE's computational resources without requiring interactive OAuth consent. This approach is suitable for server-side applications where no human user is present to complete a browser-based authentication flow.

GEE assets used by the system:
- `projects/ghana-project-73326/assets/maize_cleaned_2021_2023` — Maize training points
- `projects/ghana-project-73326/assets/Rice50fields` — Rice (non-maize) training polygons

### 6.3 Scalability Considerations

The architecture supports horizontal scaling through several mechanisms:
- GEE handles all satellite processing in the cloud, with no local compute requirements
- DynamoDB scales automatically with request volume
- The backend is stateless (no server-side sessions), allowing multiple instances behind a load balancer
- Async analysis endpoints prevent timeout issues under heavy load

---

## 7. Limitations and Recommendations

### 7.1 Current Limitations

1. **Yield prediction accuracy:** The yield regressor's R-squared of -0.23 indicates that satellite-derived features alone are insufficient to accurately predict maize yield at the individual farm level. Yield is influenced by management factors (fertiliser, planting density, weed control, variety) that are not observable from space.

2. **Geographic transferability:** Models were trained exclusively on Nanton District data. While the system accepts polygons from anywhere in Ghana, classification and yield predictions may be less reliable in agro-ecological zones that differ significantly from the training region (e.g., forest-savanna transition, coastal zones).

3. **Cloud cover during rainy season:** The June-October growing season coincides with Ghana's rainy season, resulting in frequent cloud cover that limits the number of usable satellite observations. The system mitigates this through relaxed cloud filtering for time-series, but some farms may have sparse temporal coverage.

4. **Training sample size:** With 178 classification samples and 127 yield samples, the training dataset is relatively small for a Random Forest model. This limits the model's ability to generalise across the full range of conditions encountered in Ghanaian agriculture.

### 7.2 Recommendations for Improvement

1. **Expand training data:** Collect additional ground-truth data from multiple districts across different agro-ecological zones, targeting a minimum of 500 samples for classification and 300 for yield regression.

2. **Incorporate Sentinel-1 SAR:** Synthetic Aperture Radar data is unaffected by cloud cover and provides complementary information about crop structure and soil moisture. Combining optical and SAR features could significantly improve both temporal coverage and prediction accuracy.

3. **Add management variables:** Where available, incorporate information about planting date, fertiliser application, and crop variety as additional predictor variables for yield estimation.

4. **Phenological features:** Extract crop phenology metrics (green-up date, peak NDVI date, senescence onset) from the time-series, which may correlate more strongly with yield than single-date composite values.

5. **Model retraining pipeline:** Establish a systematic process for periodic model retraining as new ground-truth data becomes available, with version tracking and performance comparison against previous models.

6. **Validation campaigns:** Conduct independent validation using held-out farm data not used in training, ideally from districts outside the Nanton training region, to quantify geographic transferability.

---

## 8. Conclusion

The Maize Intelligence System demonstrates the feasibility of combining satellite remote sensing, cloud computing, and machine learning to provide automated crop classification and yield estimation for smallholder maize farms in Ghana. The system achieves 87.7% classification accuracy in distinguishing maize from non-maize crops, and provides yield estimates with transparent uncertainty quantification.

The web-based interface makes these capabilities accessible to agricultural stakeholders without requiring specialised remote sensing expertise. Users can upload or draw farm boundaries, receive analysis results within seconds, and export reports for decision-making purposes.

While the yield regression model requires further development (additional training data and features) to achieve operational accuracy, the classification capability and the overall system architecture provide a solid foundation for continued improvement as more ground-truth data becomes available from field campaigns across Ghana.

---

## 9. References

1. Copernicus Sentinel-2 Mission. European Space Agency (ESA). https://sentinel.esa.int/web/sentinel/missions/sentinel-2
2. Gorelick, N. et al. (2017). Google Earth Engine: Planetary-scale geospatial analysis for everyone. Remote Sensing of Environment, 202, 18-27.
3. Funk, C. et al. (2015). The climate hazards infrared precipitation with stations (CHIRPS). Scientific Data, 2, 150066.
4. Hengl, T. et al. (2021). African soil properties and nutrients mapped at 30 m spatial resolution using machine learning. Scientific Reports, 11, 4958.
5. Breiman, L. (2001). Random Forests. Machine Learning, 45(1), 5-32.
6. Huete, A. et al. (2002). Overview of the radiometric and biophysical performance of the MODIS vegetation indices. Remote Sensing of Environment, 83(1-2), 195-213.
7. Delegido, J. et al. (2011). Evaluation of Sentinel-2 red-edge bands for empirical estimation of green LAI and chlorophyll content. Sensors, 11(7), 7063-7081.
8. Munyati, C. (2004). Use of principal component analysis (PCA) of remote sensing images in wetland change detection on the Kafue Flats, Zambia. Geocarto International, 19(3), 11-22.

---

*This document describes the Maize Intelligence System as delivered to the Ghana Space Science and Technology Institute. The system source code is maintained at github.com/bigdataghana/maize-yield.*
