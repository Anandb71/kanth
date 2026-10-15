# Submission kit

Two things to post, in this order. Attach `docs/media/kanth-demo.mp4` to both the social post and the Discord post (it is 6.98 MB, under Discord's 10 MB limit, so it plays inline).

## 1. Social post (quote the announcement)

Quote this post: https://x.com/SarvamAI/status/2109980905318326594

### X (279 of 280 weighted characters, with the link counted as 23)

```
Bulbul usually speaks to people. In Kanth, it speaks as someone.

For people who cannot speak: four replies in Tamil, Hindi or Hinglish, voiced by Bulbul V4 Flash before you choose. Pick one; it plays in about 50 ms.

kanth-nu.vercel.app
@SarvamAI #SarvamBulbulBuildChallenge
```

### LinkedIn

```
They asked us to build something that speaks. We built something that lets someone speak.

People who talk through AAC devices manage under 10 words a minute, and 1.7 with a single switch. English conversation runs at 160 to 200, and a pause of 700 ms already sounds like reluctance. By the time a reply is typed, the conversation has moved on.

Kanth is a voice for people who cannot speak, built on Sarvam's Bulbul V4 Flash:

1. Saaras listens to the person in front of you, in Tamil, Hindi, English or a mix.
2. Sarvam-105B drafts four short replies in your language, the way you mix it, while they are still talking.
3. Bulbul V4 Flash voices all four before you choose.
4. You choose by touch, one switch, dwell or a blink. You are heard about 50 ms after choosing.

A tone dial changes both the words and Bulbul's pace, pitch and loudness. Emergency phrases are stored on the device and speak with no network. Nothing is ever said that the user did not choose.

On the live site, Bulbul V4 Flash has all four replies voiced a median 1.6 seconds after the other person stops, so the one you choose plays in about 50 ms. When a draft fits, a reply that would take about two minutes to type by eye gaze is heard about 3.4 seconds after the other person stops (modeled from measured times). Often none fits: then one press on Yes, No or a number redrafts all four, and typing is always there. We published what did not go our way too, and every measurement, script and source is in the repo.

The demo is a simulated conversation with a fictional user, and every voice in it is Bulbul. Kanth has not been tested with AAC users yet. That is the next step, and we would love to hear from speech therapists and AAC users.

Try it: https://kanth-nu.vercel.app
Code: https://github.com/Anandb71/kanth

#SarvamBulbulBuildChallenge @Sarvam AI
```

## 2. Discord post

Channel: the projects channel. Tag: `Sarvam Bulbul Build Challenge`.

```
Name: Anand
Project: Kanth, a voice for people who cannot speak. A mother, a doctor and a friend talk to Arjun (ALS) in Tamil and Hinglish. Saaras listens, Sarvam-105B drafts four replies, and Bulbul V4 Flash voices all four before he chooses, so his reply plays about 50 ms after the tap. One switch, dwell or blink; an offline emergency board. Every number in the README is measured or cited, with the data and scripts to reproduce it. Try it, no login: https://kanth-nu.vercel.app
Social Post: <paste the link to your X or LinkedIn post>
GitHub: https://github.com/Anandb71/kanth
```

## Before posting

- Ask a moderator in the Discord whether one person may enter two projects. Galli Commentary is already entered from this GitHub account. If only one entry is allowed, choose which to submit before posting either.
- Redeploy the site (`node scripts/build-vercel.mjs && vercel deploy --prebuilt --prod`) so https://kanth-nu.vercel.app/media/kanth-demo.mp4 serves the current 80 s film, then open the README's "Watch the demo with sound" link and check it plays.
- On github.com: drag `docs/media/kanth-demo.mp4` into the README editor and put the resulting video link under the tagline, so the repo page has a player with sound. In the repo settings, set Website to https://kanth-nu.vercel.app, add topics (aac, accessibility, sarvam, bulbul, text-to-speech, tamil, hindi), and upload `docs/media/poster.png` as the social preview.
- Watch the video once with sound.
- Run the one-line setup from the README on a clean folder with your key.
