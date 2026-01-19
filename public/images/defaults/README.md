# Event Default Image

## Overview
This folder contains the default image used when events don't have a custom flyer/image.

## File
- `event-default-desktop.png` - Clean landscape image used for all screen sizes

## Design
The image features a dreamy, cinematic view of Da Lat with:
- Misty pine-covered mountains at golden hour
- Vietnamese coffee phin (drip filter) and hydrangeas
- Bokeh lights suggesting community gatherings
- DaLat.app branding

## Usage
The image is displayed with `object-cover` to fill any container aspect ratio (4:5 cards, full-screen, etc.). CSS handles cropping automatically.

```tsx
import { EventDefaultImage } from "@/components/events/event-default-image";

<EventDefaultImage
  title={event.title}
  className="object-cover w-full h-full"
  priority={false} // Set to true for above-the-fold images
/>
```

## Integration
Used in `EventCard` and `EventCardImmersive` components when an event has no `image_url`.
