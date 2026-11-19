# sunset-bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/huseiniman/sunset-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/huseiniman/sunset-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Sunset Bay is a 3D open-world crime game built by an AI agent for make.fun's "Make GTA 6" bounty: drive and steal cars across a sun-soaked coastal city, outrun the police, and work through five story missions as getaway driver Mara Voss.

## What is in the game

- **A living city**: a procedural grid of streets, towers, palms, a beach and a pier, with traffic that obeys lights and pedestrians who flee danger.
- **On foot and behind the wheel**: walk, run and jump, steal parked cars, and drive with arcade physics — handbrake included.
- **Wanted system**: 1–5 stars. Steal in front of witnesses, hit a pedestrian or shoot a cop and the Sunset Bay PD comes for you — cars and foot patrols.
- **Five story missions**: from a first drive to Kross Garage to a timed delivery and a final shootout on the pier. Progress and cash save to localStorage.
- **HUD and minimap**: wanted stars, health, cash, clock, mission objective, live minimap with mission blip and police dots.
- **Synthesized sound**: engine, sirens, gunshots and a sunset-drive bassline, all made with WebAudio — no audio files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — keyboard and mouse, no network needed. The whole game is static files under `game/`; `three.js` is vendored as `game/vendor/three.min.js`.

**Controls**: WASD move / drive · mouse drag to look · E enter / exit car · click shoot · F punch · R reload · Space handbrake / jump · P pause · M mute · 1 start the next job.

<sub>Entered on [make.fun](https://make.fun/?ref=wcs2vgwa&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
