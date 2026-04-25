#!/usr/bin/env bash
# Render vehicle video templates locally to MP4.
#
# Usage:
#   ./scripts/render-preview.sh                        # render all templates
#   ./scripts/render-preview.sh ModernDark             # render one (partial name match)
#   ./scripts/render-preview.sh ModernDark --scene 1   # render only scene 1 (first 10s)
#   ./scripts/render-preview.sh ModernDark --frames 0-90  # specific frame range
#   ./scripts/render-preview.sh ModernDark --fast      # half resolution, faster render
#
# Outputs go to remotion/out/

set -e

ENTRY="remotion/index.tsx"
PROPS="remotion/preview-props.json"
OUTDIR="remotion/out"
FILTER="all"
FRAME_RANGE=""
SCALE=1
EXTRA_FLAGS=""

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --scene)
      # Scene shortcuts: render ~10s window per scene
      case "$2" in
        1) FRAME_RANGE="--frames=0-299" ;;
        2) FRAME_RANGE="--frames=300-749" ;;
        3) FRAME_RANGE="--frames=750-1049" ;;
        4) FRAME_RANGE="--frames=1050-1199" ;;
        *) echo "Unknown scene $2 (use 1-4)"; exit 1 ;;
      esac
      shift 2 ;;
    --frames)
      FRAME_RANGE="--frames=$2"
      shift 2 ;;
    --fast)
      # Half resolution = 4x faster render
      SCALE=0.5
      shift ;;
    *)
      FILTER="$1"
      shift ;;
  esac
done

[[ $SCALE != 1 ]] && EXTRA_FLAGS="--scale=$SCALE"

mkdir -p "$OUTDIR"

declare -A TEMPLATES=(
  ["VehicleModernDark"]="modern-dark.mp4"
  ["VehicleBrightShowcase"]="bright-showcase.mp4"
  ["VehicleSplitGallery"]="split-gallery.mp4"
  ["VehiclePhotoSlideshow"]="photo-slideshow.mp4"
  ["VehicleReelsPortrait"]="reels-portrait.mp4"
  ["VehicleReelsFast"]="reels-fast.mp4"
)

render_template() {
  local COMP="$1"
  local FILE="$2"
  # Add frame range suffix to filename so clips don't overwrite full renders
  local SUFFIX=""
  [[ -n "$FRAME_RANGE" ]] && SUFFIX="-clip"
  [[ $SCALE != 1 ]] && SUFFIX="${SUFFIX}-fast"
  local OUT="$OUTDIR/${FILE%.mp4}${SUFFIX}.mp4"

  echo ""
  echo "  Template : $COMP"
  echo "  Output   : $OUT"
  [[ -n "$FRAME_RANGE" ]] && echo "  Frames   : $FRAME_RANGE"
  [[ $SCALE != 1 ]] && echo "  Scale    : ${SCALE}x (fast mode)"
  echo "  ──────────────────────────────────"

  START=$(date +%s)

  npx remotion render "$ENTRY" "$COMP" "$OUT" \
    --props="$PROPS" \
    --codec=h264 \
    --jpeg-quality=85 \
    --concurrency=4 \
    $FRAME_RANGE \
    $EXTRA_FLAGS \
    2>&1 | grep -E "^Rendering|^Done|^Error|ERR|WARN" || true

  END=$(date +%s)
  SIZE=$(du -sh "$OUT" 2>/dev/null | cut -f1)
  echo "  Done in $((END - START))s — $SIZE"
}

if [[ "$FILTER" == "all" ]]; then
  echo ""
  echo "Rendering all ${#TEMPLATES[@]} templates..."
  for COMP in "${!TEMPLATES[@]}"; do
    render_template "$COMP" "${TEMPLATES[$COMP]}"
  done
else
  MATCHED=false
  for COMP in "${!TEMPLATES[@]}"; do
    if [[ "${COMP,,}" == *"${FILTER,,}"* ]]; then
      render_template "$COMP" "${TEMPLATES[$COMP]}"
      MATCHED=true
    fi
  done
  if ! $MATCHED; then
    echo ""
    echo "No template matching '$FILTER'"
    echo "Available:"
    for COMP in "${!TEMPLATES[@]}"; do echo "  $COMP"; done
    exit 1
  fi
fi

echo ""
echo "Output files:"
ls -lh "$OUTDIR/"*.mp4 2>/dev/null | awk '{print "  "$NF, $5}'
