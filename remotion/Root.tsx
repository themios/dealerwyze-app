import React from 'react';
import { Composition } from 'remotion';
import { VehicleListing, VehicleListingProps } from './VehicleListing';
import { DealerWyzePitch, PITCH_DURATION } from './DealerWyzePitch';
import { VehicleShowcase, SHOWCASE_DURATION } from './VehicleShowcase';
import { VehicleModernDark, TEMPLATE_DURATION as MODERN_DARK_DURATION } from './VehicleModernDark';
import { VehicleReelsPortrait, TEMPLATE_DURATION as REELS_DURATION } from './VehicleReelsPortrait';
import { VehiclePhotoSlideshow, TEMPLATE_DURATION as SLIDESHOW_DURATION } from './VehiclePhotoSlideshow';
import { VehicleBrightShowcase, TEMPLATE_DURATION as BRIGHT_DURATION } from './VehicleBrightShowcase';
import { VehicleSplitGallery, TEMPLATE_DURATION as SPLIT_DURATION } from './VehicleSplitGallery';
import { VehicleReelsFast, TEMPLATE_DURATION as REELS_FAST_DURATION } from './VehicleReelsFast';
import { ContentReel, getContentReelDuration } from './ContentReel';
import { DEFAULT_CONTENT_PROPS } from './ContentReel/types';
import { DEFAULT_PROPS } from './types';

const defaultVehicleProps: VehicleListingProps = {
  year: 2022,
  make: 'Toyota',
  model: 'Camry',
  price: 21500,
  mileage: 34000,
  photoUrl: 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=1280',
  dealerName: 'Apollo Auto',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VehicleListing"
        component={VehicleListing}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultVehicleProps}
      />
      <Composition
        id="DealerWyzePitch"
        component={DealerWyzePitch}
        durationInFrames={PITCH_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="VehicleShowcase"
        component={VehicleShowcase}
        durationInFrames={SHOWCASE_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{}}
      />
      <Composition
        id="VehicleModernDark"
        component={VehicleModernDark as React.ComponentType<Record<string, unknown>>}
        durationInFrames={MODERN_DARK_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="VehicleReelsPortrait"
        component={VehicleReelsPortrait as React.ComponentType<Record<string, unknown>>}
        durationInFrames={REELS_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="VehiclePhotoSlideshow"
        component={VehiclePhotoSlideshow as React.ComponentType<Record<string, unknown>>}
        durationInFrames={SLIDESHOW_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="VehicleBrightShowcase"
        component={VehicleBrightShowcase as React.ComponentType<Record<string, unknown>>}
        durationInFrames={BRIGHT_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="VehicleSplitGallery"
        component={VehicleSplitGallery as React.ComponentType<Record<string, unknown>>}
        durationInFrames={SPLIT_DURATION}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="VehicleReelsFast"
        component={VehicleReelsFast as React.ComponentType<Record<string, unknown>>}
        durationInFrames={REELS_FAST_DURATION}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="ContentReel"
        component={ContentReel as React.ComponentType<Record<string, unknown>>}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_CONTENT_PROPS}
        calculateMetadata={({ props }) => {
          const p = props as unknown as typeof DEFAULT_CONTENT_PROPS
          const slideBased = getContentReelDuration(p.slides?.length ?? 5)
          const durationInFrames = p.totalDurationFrames
            ? Math.max(slideBased, p.totalDurationFrames)
            : slideBased
          return { durationInFrames }
        }}
      />
    </>
  );
};
