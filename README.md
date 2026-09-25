# 3D ULPIN v2 — TypeScript + FastAPI + 2D/Satellite + Selected-Property 3D

## What changed
- TypeScript React frontend with Leaflet 2D cadastral map.
- OpenStreetMap base layer and satellite imagery layer.
- Real supplied KML/CSV parcels are clickable.
- Selecting a parcel automatically focuses the map and opens the property inspector.
- Generate 3D ULPIN switches to a **single selected-property** 3D scene.
- FastAPI backend exposes `/api/ulpins`, `/api/ulpins/{name}` and `/api/ulpins/{name}/generate`.
- DEM, DSM and nDSM are derived from supplied source files.
- Underground is explicitly marked inferred.

## Frontend
```bash
npm install
npm run dev
```

## Backend
Open another terminal:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
uvicorn backend.app.main:app --reload --port 8000
```

Then open the Vite URL, normally `http://localhost:5173`.

## Map services
- OpenStreetMap raster tiles are used without an API key and with visible attribution.
- Satellite mode uses the public ArcGIS World Imagery tile endpoint. Keep the attribution visible and check the provider terms before production/commercial deployment.
- No private API key is embedded in the project.

## Important data rule
The selected parcel's KML geometry is the source footprint for its generated 3D model. The app does not replace it with a generic building.

## Updated 3D renderer

The 3D Property view now uses the selected parcel's exact KML/CSV polygon as the footprint. Each floor is a separate extruded mesh, so the model keeps the real parcel shape instead of using generic rectangular building boxes. Floors are individually clickable and can be isolated, exploded, and inspected. Inferred unit boxes are shown only inside the selected polygon and are treated as visualization/proxy data.

The renderer uses Three.js `ExtrudeGeometry` for the exact footprint and ray/pointer interaction through React Three Fiber. No 3D provider API key is required for this local geometry workflow.

## Latest additions
- 2D ULPIN input on Dashboard and 2D Map: enter a loaded parcel/ULPIN name and click Create 3D ULPIN.
- Full 3D Tree page: renders every supplied polygon with its exact footprint as a 3D volume using source building heights/floors.
- Selected building is highlighted in cyan/yellow and remains labeled in the full-scene view.
- Full 3D Tree includes a Create selected 3D ULPIN action and click-to-select buildings.
- The full-tree view uses the supplied KML/CSV parcel geometry and does not generate generic rectangular buildings.

## System Workflow Update

The app now includes a `System Workflow` page matching the supplied architecture flow:

- Existing 2D ULPIN -> exact polygon -> DEM/DSM -> nDSM -> classification -> 3D -> validation -> visualization -> reporting.
- Add New Polygon Coordinates -> format/topology/overlap review -> 3D generation.
- Full 3D Tree remains available for all supplied and user-created polygon records.
- User-created polygons are marked REVIEW REQUIRED until measured DEM/DSM/elevation evidence is available.
- Export actions provide JSON registry data and GeoJSON parcel output.
- ML wording is intentionally `ML-ready` / rule-based in the current build; no fake ML model is claimed.

## New Dataset Integration

The original source CSV files remain unchanged. Three additional CSV files are included under `public/data/`:

- `ulpin_2d_ownership_final.csv` — links each feature/building name to a 2D ULPIN, category, owner and land-owner information.
- `floor_plan_apartments.csv` — provides floor-level unit inventory, unit type, BHK where present, and owner information for apartment/shop buildings.
- `dem_dsm_reserve_points_final.csv` — provides 14 unassigned reference DEM/DSM points for manually drawn polygons. These are reference elevations, not building measurements.

The FastAPI loader now joins ownership and floor-plan records to the existing parcel/KML records. Where a floor plan exists, its above-ground floor inventory is used for the reconstructed floor stack instead of the explicitly placeholder DSM floor count. The DSM floor value is retained separately as `elevation_detected_floors`.

The frontend now:

- Shows the ownership-linked 2D ULPIN in parcel inspection and the ULPIN Registry.
- Adds an Ownership page.
- Shows source floor-plan unit counts in Dashboard and Units/Floors.
- Sends source unit inventory into the generated 3D property and displays inferred unit boxes/labels on the selected floor. The CSV does not contain unit polygons, so their spatial placement is explicitly inferred.
- Lets manually created polygons use the nearest reserve DEM/DSM point as a reference elevation while keeping the record `REVIEW REQUIRED`.
- Supports searching by 2D ULPIN and owner name.
- Keeps the original `ulpin_polygons.csv`, `dsm_points.csv`, `dem_points.csv`, and `ulpin.kml` intact.

## Floor-plan visualization update

The 3D property viewer now uses `floor_plan_apartments.csv` to visualize the supplied floor/unit inventory on the selected floor. Each source unit is rendered as an inferred spatial layout inside the exact parcel footprint, with low perimeter walls, unit labels, click selection, floor-plan toggle, and owner/type/BHK details.

Important: the CSV contains unit inventory but does not contain individual unit polygons or measured room dimensions. Therefore the unit spatial layout is explicitly inferred for visualization and is not presented as cadastral unit geometry.

## Navigation Update

The separate `System Workflow` navigation page has been removed. `Add New Polygon` remains as the dedicated new-geometry workflow, while existing 2D ULPIN generation continues through the 2D Map and dashboard actions.


## Underground AI screening
The FastAPI backend includes an AI-assisted underground/subsurface screening endpoint at `/api/ai/underground?name={parcel}`. It uses an Isolation Forest over parcel geometry, DEM/DSM/nDSM, height, floors, unit count and building-use features. Explicit basement/underground records from the supplied floor-plan/ownership data are reported separately. This is a prototype anomaly-screening model; DEM/DSM do not directly measure underground structures.

Install backend dependencies with `pip install -r backend/requirements.txt`.

## Role-based demo login

The project now includes a role-based access prototype with three login roles:

- Nagar Palika / Municipal Authority — `municipal@ulpin.gov` / `ULPIN@123`
- Government Staff — `staff@ulpin.gov` / `ULPIN@123`
- Citizen — `citizen@ulpin.gov` / `ULPIN@123`

Municipal Authority and Government Staff use the same core ULPIN workspace with different scope messaging. Citizens receive a separate property-service landing page and a reduced workspace navigation.

> These credentials are demo-only frontend authentication for the hackathon prototype, not production security. Production deployment should replace this with server-side authentication, password hashing, sessions/JWT and backend RBAC enforcement.


## Role-based municipal workflow
- Nagar Palika uses Municipal Data Intake as its primary data-entry workflow.
- Intake order: state → district → city → ward/locality → project land → existing 2D ULPIN or new polygon → building data.
- Apartments can include floor-plan unit inventory and underground records. Residence houses use a simple residence-house record rather than apartment unit subdivision.
- Admin retains the broader GIS, analytics, validation and reporting workspace.
- Citizen portal includes a building-report download action.

## CSV persistence
Municipal submissions are written by the FastAPI backend to `public/data/municipal_property_records.csv`, ownership updates go to `ulpin_2d_ownership_final.csv`, apartment unit inventory goes to `floor_plan_apartments.csv`, and apartment underground source entries go to `underground_records.csv`.
