import { t } from '../i18n/index.ts';
import type { World } from './world.ts';

/**
 * Onboarding teaches one concept at a time, in the world, while the player is already playing.
 *
 * Each step has a text prompt, a minimum time on screen so a fast player still reads it, and a
 * condition that is satisfied by *doing the thing* rather than by clicking "next". Returning players
 * (a completed run stored in settings) get the whole sequence skipped.
 */
export interface OnboardingStep {
  key: string;
  text: string;
  minTime: number;
  done: (world: World) => boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: 'move',
    text: t('tutorial.move'),
    minTime: 1.2,
    done: (w) => w.stats.firstMoveAt >= 0 && w.time - w.stats.firstMoveAt > 1.4,
  },
  {
    key: 'cover',
    text: t('tutorial.cover'),
    minTime: 4.5,
    done: (w) => w.time > 9,
  },
  {
    key: 'inspect',
    text: t('tutorial.inspect'),
    minTime: 2,
    done: (w) => w.hintKey.startsWith('inspect:'),
  },
  {
    key: 'lay',
    text: t('tutorial.lay'),
    minTime: 3,
    done: (w) => w.routes.some((r) => r.linked),
  },
  {
    key: 'follow',
    text: t('tutorial.follow'),
    minTime: 2,
    done: (w) => w.stats.deliveries >= 1,
  },
  {
    key: 'both',
    text: t('tutorial.both'),
    minTime: 3,
    done: (w) => w.colony.totalFood > 0 && w.colony.totalWater > 0,
  },
  {
    key: 'sprint',
    text: t('tutorial.sprint'),
    minTime: 3.5,
    done: (w) => w.time > 60,
  },
  {
    key: 'risk',
    text: t('tutorial.erase'),
    minTime: 4,
    done: (w) => w.time > 78,
  },
];

export function updateOnboarding(world: World, dt: number): void {
  const ob = world.onboarding;
  if (ob.seenBefore || ob.step >= ONBOARDING_STEPS.length) {
    world.tutorial = '';
    return;
  }
  if (world.operation > 1) {
    ob.step = ONBOARDING_STEPS.length;
    world.tutorial = '';
    return;
  }

  const step = ONBOARDING_STEPS[ob.step];
  ob.stepTime += dt;
  world.tutorial = step.text;
  if (step.done(world)) ob.satisfied = true;
  if (ob.satisfied && ob.stepTime >= step.minTime) {
    ob.step++;
    ob.stepTime = 0;
    ob.satisfied = false;
    if (ob.step >= ONBOARDING_STEPS.length) world.tutorial = '';
  }
}
