📄 PRD — Vehicle Video Template Lab System
1. Overview
Problem

We need a fast, structured way to design, test, compare, and refine video ad templates for a dealership SaaS platform.

Current issues:

Templates are built ad-hoc
No controlled experimentation
No separation of preview vs final render
No standardized parameter system
Difficult to compare variations objectively
Goal

Build a Template Lab System that allows:

Rapid creation of video templates using Remotion
Controlled variation of parameters (layout, fonts, voice, timing, etc.)
Side-by-side comparison of outputs
Batch rendering via CLI
Easy promotion of winning templates into production SaaS
2. System Objectives

The system must:

Enable creation of 10+ standardized video presets
Allow parameter-driven template variations
Support real vehicle data inputs
Provide instant preview (low-cost)
Allow batch rendering for evaluation
Support voice testing (TTS variations)
Enable side-by-side comparison
Produce outputs ready for SaaS integration
3. Core Concept
Shift in approach

We are NOT building:

“10 separate video templates”

We ARE building:

1 template engine + multiple presets

4. Architecture
Components
Template Lab
├── Remotion Engine (core renderer)
├── Preset System (JSON configs)
├── Template Components (React)
├── Preview System (Remotion Player)
├── CLI Batch Renderer
├── Voice Engine (Google TTS)
├── Asset Manager (images/audio)
└── Comparison Interface (web UI)
5. Template Engine Design
Single Composition

Create one main composition:

<VehicleReel {...props} />

Everything is controlled via props.

6. Props Schema

Define a strict schema:

type VideoTemplateProps = {
  vehicle: {
    year: number;
    make: string;
    model: string;
    price: number;
    mileage: number;
    features: string[];
  };

  images: string[];

  branding: {
    dealerName: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };

  layout: {
    format: "reel" | "slideshow" | "split" | "cinematic";
    aspectRatio: "9:16" | "1:1" | "16:9";
    imageLayout: "single" | "grid" | "split";
    headlinePosition: "top" | "center" | "bottom";
    logoPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };

  timing: {
    durationSec: number;
    imageDurationMs: number;
    transitionSpeed: number;
  };

  typography: {
    fontSizeScale: number;
    textDensity: "low" | "medium" | "high";
  };

  animation: {
    transitionStyle: "cut" | "fade" | "zoom" | "slide";
  };

  narration: {
    enabled: boolean;
    voiceId: string;
    speechRate: number;
    scriptSource: "rules" | "llm" | "custom";
  };

  subtitles: {
    enabled: boolean;
    style: "minimal" | "bold";
  };

  cta: {
    text: string;
    style: "pill" | "banner" | "minimal";
  };
};
7. Preset System
Structure

Each preset = JSON file:

/presets
  budget-daily-driver.json
  family-suv.json
  fast-reel.json
Example
{
  "presetId": "budget-daily-driver",
  "layout": {
    "format": "reel",
    "aspectRatio": "9:16",
    "imageLayout": "single",
    "headlinePosition": "top",
    "logoPosition": "top-left"
  },
  "timing": {
    "durationSec": 18,
    "imageDurationMs": 1800,
    "transitionSpeed": 1.0
  },
  "typography": {
    "fontSizeScale": 1.0,
    "textDensity": "medium"
  },
  "animation": {
    "transitionStyle": "zoom"
  },
  "narration": {
    "enabled": true,
    "voiceId": "en-US-Chirp-HD-F",
    "speechRate": 1.0,
    "scriptSource": "rules"
  },
  "subtitles": {
    "enabled": true,
    "style": "bold"
  },
  "cta": {
    "text": "Message us today",
    "style": "pill"
  }
}
8. Required Presets (Initial 10)
Budget Daily Driver
Family SUV
Work Truck
Clean Luxury
Fast Reel
Slideshow Minimal
Split Gallery
Caption Only (No Voice)
Voiceover Focus
Spanish Variant
9. Preview System
Requirements
Fast (<2 seconds)
Low resolution
Optional no voice
Interactive controls
Implementation

Use:

@remotion/player
10. Comparison UI
Features
Select vehicle
Select multiple presets
Render previews side-by-side
Toggle variables live
Score templates
Layout
[ Vehicle Selector ]

[ Preset A ]   [ Preset B ]   [ Preset C ]

[ Score: Clarity / Trust / Scroll Stop ]
11. CLI System
Single Render
npx remotion render src/index.tsx VehicleReel out.mp4 --props="$(cat preset.json)"
Batch Render
for f in presets/*.json; do
  name=$(basename "$f" .json)
  npx remotion render src/index.tsx VehicleReel "renders/${name}.mp4" --props="$(cat "$f")"
done
12. Voice Testing System
Requirements
Swap voices easily
Test speech rate
Reuse script
Approach
Generate script once
Store script hash
Generate multiple audio variants
13. Script Engine
Modes
rules-based
LLM-generated
custom input
14. Asset Requirements

Test with real dealership inventory:

low-quality photos
mixed lighting
real pricing
imperfect data
15. Evaluation Framework

Each template scored on:

Scroll stopping power
Clarity
Professionalism
Trust
Speed of understanding
Fit for target customer
16. Folder Structure
/template-lab
  /src
    /components
    /templates
    /scenes
  /presets
  /data
  /renders
  /audio
  /scripts
17. Development Phases
Phase 1
Base Remotion template
Props system
3 presets
Phase 2
10 presets
CLI batch rendering
Phase 3
Preview UI
Side-by-side comparison
Phase 4
Voice testing
Script engine
18. Success Criteria

System is complete when:

10 templates can be generated from presets
Batch rendering works
Preview system works
Voice variants can be tested
Templates can be compared side-by-side
Winning templates can be exported into SaaS
19. Non-Goals
No need for production scalability yet
No need for full SaaS integration
No need for user accounts
20. Key Principle

This is not a video generator.
This is a template experimentation engine.

21. Final Instruction for Claude / Cursor

Build a Remotion-based template lab system with:

a single prop-driven composition
JSON-based preset system
CLI batch rendering
preview UI using Remotion Player
modular scene system
support for voice, layout, and timing variations

Focus on flexibility, speed of iteration, and clean architecture.