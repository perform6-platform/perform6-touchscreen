import { useState } from 'react';
import { HomeHeroVideo } from '../components/home';
import { SessionPlayer } from '../components/session';
import {
  CardThumbnail,
  FullProgramContent,
  GlowCard,
  Logo,
  PhaseCardContent,
  SectionDivider,
  SessionModal,
  StartHereContent,
  TouchHint,
} from '../components/ui';
import {
  FULL_PROGRAM_ITEMS,
  getFullProgramSessionConfig,
} from '../lib/fullProgram';
import { useHomeIdle } from '../hooks/useHomeIdle';
import { getPhase1DefaultSessionConfig, PHASE1_ITEMS } from '../lib/phase1';
import { getPhase2DefaultSessionConfig, PHASE2_ITEMS } from '../lib/phase2';

const IMAGES = {
  phase1: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80&auto=format&fit=crop',
  phase2: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80&auto=format&fit=crop',
  fullProgram: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=700&q=80&auto=format&fit=crop',
};

const START_HERE_ITEMS = [
  'Learn the Perform6 system',
  'Complete the Safety Check',
  'Prepare your body for training',
];

const HOME_IDLE_VIDEO = '/videos/warmup.mp4';
const HOME_IDLE_DELAY_MS = 30000;

type ActiveSession = {
  source: 'start-here' | 'phase1' | 'phase2' | 'full-program';
  title: string;
  step: { current: number; total: number };
  currentStepLabel: string;
  nextStepLabel: string;
  initialTimeRemaining: number;
  initialProgress: number;
  accent: 'blue' | 'cyan' | 'purple' | 'gold';
  videoSrc: string;
};

export default function Home() {
  const [startHereOpen, setStartHereOpen] = useState(false);
  const [phase1Open, setPhase1Open] = useState(false);
  const [phase2Open, setPhase2Open] = useState(false);
  const [fullProgramOpen, setFullProgramOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  const sessionOpen = activeSession !== null;
  const modalOpen = startHereOpen || phase1Open || phase2Open || fullProgramOpen;

  const idle = useHomeIdle({
    delayMs: HOME_IDLE_DELAY_MS,
    blocked: modalOpen || sessionOpen,
  });

  const handleBeginStartHere = () => {
    setStartHereOpen(false);
    idle.close();
    setActiveSession({
      source: 'start-here',
      title: 'Start Here',
      step: { current: 1, total: 6 },
      currentStepLabel: 'Safety Check Movement Prep',
      nextStepLabel: 'Dynamic Warmup',
      initialTimeRemaining: 275,
      initialProgress: 16,
      accent: 'cyan',
      videoSrc: HOME_IDLE_VIDEO,
    });
  };

  const handleStartHereOpen = () => {
    idle.close();
    setPhase1Open(false);
    setPhase2Open(false);
    setFullProgramOpen(false);
    setStartHereOpen(true);
  };

  const handlePhase1Open = () => {
    idle.close();
    setStartHereOpen(false);
    setPhase2Open(false);
    setFullProgramOpen(false);
    setPhase1Open(true);
  };

  const handlePhase2Open = () => {
    idle.close();
    setStartHereOpen(false);
    setPhase1Open(false);
    setFullProgramOpen(false);
    setPhase2Open(true);
  };

  const handleBeginPhase1 = () => {
    setPhase1Open(false);
    idle.close();
    setActiveSession({
      source: 'phase1',
      ...getPhase1DefaultSessionConfig(),
    });
  };

  const handleBeginPhase2 = () => {
    setPhase2Open(false);
    idle.close();
    setActiveSession({
      source: 'phase2',
      ...getPhase2DefaultSessionConfig(),
    });
  };

  const handleFullProgramOpen = () => {
    idle.close();
    setStartHereOpen(false);
    setPhase1Open(false);
    setPhase2Open(false);
    setFullProgramOpen(true);
  };

  const handleBeginFullProgram = () => {
    setFullProgramOpen(false);
    idle.close();
    setActiveSession({
      source: 'full-program',
      ...getFullProgramSessionConfig(),
    });
  };

  return (
    <main
      className="p6-home relative h-full w-full overflow-hidden"
      onPointerDown={idle.onActivity}
    >
      <HomeHeroVideo src={HOME_IDLE_VIDEO} paused />

      <div className="p6-home__grid">
        <Logo className="p6-home__logo" />

        <GlowCard
          variant="blue"
          className="p6-home__start-here"
          onClick={handleStartHereOpen}
        >
          <StartHereContent
            title="Start Here"
            bullets="The 6-Step System • Safety Check • Prep"
            description="Learn the system. Check movement. Prepare for performance."
            duration="5-10 MIN"
          />
        </GlowCard>

        <SectionDivider className="p6-home__divider">Choose Your Mode</SectionDivider>

        <GlowCard variant="cyan" className="p6-home__phase1" onClick={handlePhase1Open}>
          <PhaseCardContent
            title="Phase 1"
            keywords="Mobility • Stability • Power"
            description="Foundation Training"
            duration="15-20 MIN"
            variant="cyan"
            thumbnail={
              <CardThumbnail
                src={IMAGES.phase1}
                alt="Phase 1"
                className="aspect-[13/11] h-full w-[4.75rem] sm:w-[5.5rem] md:w-[6.5rem]"
              />
            }
          />
        </GlowCard>

        <GlowCard variant="purple" className="p6-home__phase2" onClick={handlePhase2Open}>
          <PhaseCardContent
            title="Phase 2"
            keywords="Strength • Energy • Recovery"
            description="Performance Training"
            duration="20-30 MIN"
            variant="purple"
            thumbnail={
              <CardThumbnail
                src={IMAGES.phase2}
                alt="Phase 2"
                className="aspect-[13/11] h-full w-[4.75rem] sm:w-[5.5rem] md:w-[6.5rem]"
              />
            }
          />
        </GlowCard>

        <GlowCard variant="gold" className="p6-home__full-program" onClick={handleFullProgramOpen}>
          <FullProgramContent
            title="Full Program"
            subtitle="All 6 Steps"
            description="Complete Guided Training"
            duration="60 MIN"
            image={
              <img
                src={IMAGES.fullProgram}
                alt=""
                className="h-full w-full object-cover object-center"
                draggable={false}
              />
            }
          />
        </GlowCard>

        <TouchHint className="p6-home__touch-hint" />
      </div>

      <SessionModal
        open={startHereOpen}
        onClose={() => setStartHereOpen(false)}
        onBack={() => setStartHereOpen(false)}
        onPrimary={handleBeginStartHere}
        title="Start Here"
        items={START_HERE_ITEMS}
        duration="Approx. 5-10 Minutes"
        accent="blue"
      />

      <SessionModal
        open={fullProgramOpen}
        onClose={() => setFullProgramOpen(false)}
        onBack={() => setFullProgramOpen(false)}
        onPrimary={handleBeginFullProgram}
        title="Full Program"
        items={FULL_PROGRAM_ITEMS}
        duration="Approx. 60 Minutes"
        accent="blue"
      />

      <SessionModal
        open={phase1Open}
        onClose={() => setPhase1Open(false)}
        onBack={() => setPhase1Open(false)}
        onPrimary={handleBeginPhase1}
        title="Phase 1"
        items={PHASE1_ITEMS}
        duration="Approx. 15-20 Minutes"
        accent="cyan"
      />

      <SessionModal
        open={phase2Open}
        onClose={() => setPhase2Open(false)}
        onBack={() => setPhase2Open(false)}
        onPrimary={handleBeginPhase2}
        title="Phase 2"
        items={PHASE2_ITEMS}
        duration="Approx. 20-30 Minutes"
        accent="purple"
      />

      <SessionPlayer
        open={sessionOpen || idle.isOpen}
        onClose={sessionOpen ? () => setActiveSession(null) : idle.close}
        videoSrc={activeSession?.videoSrc ?? HOME_IDLE_VIDEO}
        attractMode={idle.isOpen && !sessionOpen}
        title={activeSession?.title}
        accent={activeSession?.accent ?? 'cyan'}
        controlVariant={
          activeSession?.source === 'full-program'
            ? 'program'
            : activeSession?.source === 'start-here' ||
                activeSession?.source === 'phase1' ||
                activeSession?.source === 'phase2'
              ? 'minimal'
              : 'full'
        }
      />
    </main>
  );
}
