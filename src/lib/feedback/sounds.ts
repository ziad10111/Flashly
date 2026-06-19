import { createAudioPlayer, preload, type AudioPlayer } from "expo-audio";

const correctAnswerSound = require("../../../assets/sounds/correct-answer.mp3");
const wrongAnswerSound = require("../../../assets/sounds/wrong-answer-20582.mp3");

export let soundEnabled = true;

let correctAnswerPlayer: AudioPlayer | null = null;
let wrongAnswerPlayer: AudioPlayer | null = null;

void preload(correctAnswerSound);
void preload(wrongAnswerSound);

const getAnswerPlayer = (isCorrect: boolean) => {
  if (isCorrect) {
    correctAnswerPlayer ??= createAudioPlayer(correctAnswerSound, {
      keepAudioSessionActive: true,
    });

    return correctAnswerPlayer;
  }

  wrongAnswerPlayer ??= createAudioPlayer(wrongAnswerSound, {
    keepAudioSessionActive: true,
  });

  return wrongAnswerPlayer;
};

export const setSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
};

export const playAnswerSound = async (isCorrect: boolean) => {
  if (!soundEnabled) {
    return;
  }

  try {
    const player = getAnswerPlayer(isCorrect);
    await player.seekTo(0);
    player.play();
  } catch {
    // Sound effects should never block answer feedback or scoring.
  }
};
