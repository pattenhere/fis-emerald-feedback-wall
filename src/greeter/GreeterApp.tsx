import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateGreeterFeedbackQuestions } from "../api/greeterFeedback";
import { ProfileSwitcher } from "../components/ProfileSwitcher";
import { greeterApi, type GreeterQuestion, type GreeterRouteResponse } from "../services/greeterApi";
import { readSynthesisAuthFlag, writeSynthesisAuthFlag } from "../services/synthesisAuth";
import { synthesisModuleApi } from "../services/synthesisModuleApi";
import "../styles/greeter.css";

type Answers = { q1: string; q2: string; q3: string; q4: string };
declare const process: {
  env: Record<string, string | undefined>;
};

const EMPTY_ANSWERS: Answers = { q1: "", q2: "", q3: "", q4: "" };

const toIdleMinutes = (): number => {
  const raw = Number(process.env.GREETER_IDLE_RESET_MINUTES ?? import.meta.env.VITE_GREETER_IDLE_RESET_MINUTES ?? 3);
  if (!Number.isFinite(raw) || raw <= 0) return 3;
  return Math.max(1, Math.floor(raw));
};

const safeQuestionByPosition = (questions: GreeterQuestion[], position: number): GreeterQuestion | null =>
  questions.find((question) => Number(question.position) === position) ?? null;

const currentStepToQuestionKey = (step: number): keyof Answers => {
  if (step === 0) return "q1";
  if (step === 1) return "q2";
  if (step === 2) return "q3";
  return "q4";
};

export const GreeterApp = (): JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => readSynthesisAuthFlag());
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [eventSlug, setEventSlug] = useState("emerald-2026");
  const [eventName, setEventName] = useState("EMERALD 2026");
  const [questions, setQuestions] = useState<GreeterQuestion[]>([]);

  const [started, setStarted] = useState(false);
  const [questionStep, setQuestionStep] = useState(0);
  const [isResolvingRoute, setIsResolvingRoute] = useState(false);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [routePayload, setRoutePayload] = useState<GreeterRouteResponse | null>(null);
  const [feedbackQuestions, setFeedbackQuestions] = useState<string[]>([]);

  const [now, setNow] = useState(Date.now());
  const [lastActivityAt, setLastActivityAt] = useState(Date.now());
  const [sessionSaved, setSessionSaved] = useState(false);
  const saveInFlightRef = useRef(false);
  const idleMinutes = toIdleMinutes();

  const stage: "welcome" | "question" | "loading" | "guidance" = useMemo(() => {
    if (!started) return "welcome";
    if (isResolvingRoute) return "loading";
    if (routePayload) return "guidance";
    return "question";
  }, [isResolvingRoute, routePayload, started]);

  const activeQuestion = useMemo(
    () => safeQuestionByPosition(questions, questionStep + 1),
    [questionStep, questions],
  );
  const activeAnswerKey = currentStepToQuestionKey(questionStep);
  const activeAnswer = answers[activeAnswerKey];
  const idleTimeoutMs = idleMinutes * 60 * 1_000;
  const remainingMs = Math.max(0, idleTimeoutMs - (now - lastActivityAt));
  const showIdleCountdown = remainingMs <= 30_000;
  const idleSeconds = Math.ceil(remainingMs / 1_000);

  const markActivity = useCallback(() => {
    setLastActivityAt(Date.now());
  }, []);

  const resetExperience = useCallback(() => {
    setStarted(false);
    setQuestionStep(0);
    setIsResolvingRoute(false);
    setAnswers(EMPTY_ANSWERS);
    setRoutePayload(null);
    setFeedbackQuestions([]);
    setSessionSaved(false);
    setLastActivityAt(Date.now());
  }, []);

  const loadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    setQuestionsError(null);
    try {
      const payload = await greeterApi.getQuestions();
      const sorted = (Array.isArray(payload.questions) ? payload.questions : [])
        .slice()
        .sort((a, b) => Number(a.position) - Number(b.position));
      setQuestions(sorted);
      setEventSlug(String(payload.event_slug ?? "emerald-2026"));
      setEventName(String(payload.event_name ?? "EMERALD 2026").toUpperCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load greeter questions.";
      setQuestionsError(message);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadQuestions();
  }, [isAuthenticated, loadQuestions]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onActivity = () => markActivity();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [markActivity]);

  useEffect(() => {
    if (!started) return;
    if (remainingMs > 0) return;
    resetExperience();
  }, [remainingMs, resetExperience, started]);

  const submitPin = useCallback(async () => {
    const candidate = pinInput.trim();
    if (!candidate) {
      setPinError("Enter the synthesis PIN to continue.");
      return;
    }
    setAuthLoading(true);
    setPinError(null);
    try {
      const result = await synthesisModuleApi.verifyPin(candidate);
      if (!result.authenticated) {
        setPinError(result.error ?? "Invalid PIN.");
        return;
      }
      setIsAuthenticated(true);
      writeSynthesisAuthFlag(true);
      setPinInput("");
    } catch (error) {
      setPinError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }, [pinInput]);

  const saveSession = useCallback(async () => {
    if (sessionSaved || saveInFlightRef.current) return;
    if (!routePayload || feedbackQuestions.length < 3) return;
    if (!answers.q1 || !answers.q2 || !answers.q3 || !answers.q4) return;
    saveInFlightRef.current = true;
    try {
      await greeterApi.saveSession({
        event_slug: eventSlug,
        answer_q1: answers.q1,
        answer_q2: answers.q2,
        answer_q3: answers.q3,
        answer_q4: answers.q4,
        route_id: Number(routePayload.route_id),
        feedback_q1: feedbackQuestions[0] ?? "",
        feedback_q2: feedbackQuestions[1] ?? "",
        feedback_q3: feedbackQuestions[2] ?? "",
      });
      setSessionSaved(true);
    } catch (error) {
      console.error("[greeter] failed to save session", error);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [answers, eventSlug, feedbackQuestions, routePayload, sessionSaved]);

  useEffect(() => {
    if (stage !== "guidance") return;
    void saveSession();
  }, [saveSession, stage]);

  const onSelectAnswer = useCallback((value: string) => {
    markActivity();
    setAnswers((current) => ({ ...current, [activeAnswerKey]: value }));
  }, [activeAnswerKey, markActivity]);

  const onNext = useCallback(async () => {
    markActivity();
    if (stage === "welcome") {
      setStarted(true);
      setQuestionStep(0);
      return;
    }
    if (stage !== "question" || !activeAnswer) return;
    if (questionStep < 3) {
      setQuestionStep((current) => Math.min(3, current + 1));
      return;
    }

    setIsResolvingRoute(true);
    try {
      const routePromise = greeterApi.resolveRoute({
        event_slug: eventSlug,
        answers: {
          q1: answers.q1,
          q2: answers.q2,
          q3: answers.q3,
          q4: answers.q4,
        },
      });
      const feedbackPromise = routePromise.then((payload) =>
        generateGreeterFeedbackQuestions({
          q1Answer: answers.q1,
          q2Answer: answers.q2,
          q3Answer: answers.q3,
          q4Answer: answers.q4,
          primaryTitle: String(payload.route.primary.title ?? ""),
          primaryCategory: String(payload.route.primary.category ?? "PLATFORM"),
          primaryProducts: String(payload.route.primary.products ?? ""),
        }),
      );
      const [route, generatedQuestions] = await Promise.all([routePromise, feedbackPromise]);
      setRoutePayload(route);
      setFeedbackQuestions(generatedQuestions.slice(0, 3));
    } catch (error) {
      console.error("[greeter] failed to resolve route", error);
    } finally {
      setIsResolvingRoute(false);
    }
  }, [activeAnswer, answers, eventSlug, markActivity, questionStep, stage]);

  const onBack = useCallback(() => {
    markActivity();
    if (questionStep <= 0) {
      setStarted(false);
      return;
    }
    setQuestionStep((current) => Math.max(0, current - 1));
  }, [markActivity, questionStep]);

  const onStartOver = useCallback(() => {
    markActivity();
    void saveSession();
    resetExperience();
  }, [markActivity, resetExperience, saveSession]);

  if (!isAuthenticated) {
    return (
      <main className="greeter-shell">
        <div className="greeter-auth-overlay" role="dialog" aria-modal="true" aria-label="Greeter PIN required">
          <form
            className="greeter-auth-card"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPin();
            }}
          >
            <p className="greeter-eyebrow">GREETER ACCESS</p>
            <h1>Enter Facilitator PIN</h1>
            <label htmlFor="greeter-pin-input">PIN</label>
            <input
              id="greeter-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              disabled={authLoading}
            />
            {pinError && <p className="greeter-pin-error">{pinError}</p>}
            <button type="submit" disabled={authLoading}>{authLoading ? "Checking…" : "Unlock"}</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="greeter-shell" onClick={markActivity}>
      <header className="greeter-topbar">
        <div className="greeter-brand"><span className="greeter-brand-mark">FIS</span></div>
        <div className="greeter-topbar-right">
          <div className="greeter-event">{eventName}</div>
          <ProfileSwitcher currentRole="greeter" compact className="is-on-dark" display="initial" />
        </div>
      </header>

      <section className="greeter-stage">
        <article className="greeter-card">
          {loadingQuestions ? (
            <div className="greeter-loader-block">
              <div className="greeter-spinner" aria-hidden="true" />
              <p>Loading greeter configuration…</p>
            </div>
          ) : questionsError ? (
            <div className="greeter-loader-block">
              <p>{questionsError}</p>
              <button type="button" className="greeter-primary-btn" onClick={() => void loadQuestions()}>
                Retry
              </button>
            </div>
          ) : stage === "welcome" ? (
            <>
              <p className="greeter-eyebrow">LENDING NEXT · DEMO STATION</p>
              <h1>Find Your Path Through <span>FIS</span> Lending</h1>
              <p className="greeter-copy">
                Answer 4 quick questions and we&apos;ll route you to the demos and innovation concepts most relevant to your world — and give you the right questions to shape our roadmap.
              </p>
              <div className="greeter-badges">
                <span>4 questions</span>
                <span>~2 minutes</span>
                <span>Personalized route</span>
              </div>
              <button type="button" className="greeter-primary-btn" onClick={() => void onNext()}>
                Let&apos;s Go →
              </button>
            </>
          ) : stage === "loading" ? (
            <div className="greeter-loader-block">
              <div className="greeter-spinner" aria-hidden="true" />
              <p>Finding your route…</p>
            </div>
          ) : stage === "question" && activeQuestion ? (
            <>
              <div className="greeter-progress" aria-label={`Question ${questionStep + 1} of 4`}>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={[
                      "greeter-dot",
                      index < questionStep ? "is-complete" : "",
                      index === questionStep ? "is-active" : "",
                    ].filter(Boolean).join(" ")}
                  />
                ))}
              </div>
              <p className="greeter-eyebrow">QUESTION {questionStep + 1} OF 4</p>
              <h2>{activeQuestion.text}</h2>
              <ul className="greeter-answers">
                {activeQuestion.answers
                  .slice()
                  .sort((a, b) => Number(a.position) - Number(b.position))
                  .map((answer) => {
                    const selected = activeAnswer === answer.label;
                    return (
                      <li key={answer.id}>
                        <button
                          type="button"
                          className={`greeter-answer-row${selected ? " is-selected" : ""}`}
                          onClick={() => onSelectAnswer(answer.label)}
                        >
                          <span className="greeter-answer-icon">{answer.icon ?? "•"}</span>
                          <span className="greeter-answer-content">
                            <strong>{answer.label}</strong>
                            {answer.description ? <small>{answer.description}</small> : null}
                          </span>
                          <span className="greeter-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
              <button type="button" className="greeter-primary-btn" onClick={() => void onNext()} disabled={!activeAnswer}>
                {questionStep === 3 ? "Show My Route →" : "Next →"}
              </button>
              <button type="button" className="greeter-back-link" onClick={onBack}>
                ← Back
              </button>
            </>
          ) : routePayload ? (
            <>
              <p className="greeter-eyebrow">YOUR PERSONALIZED ROUTE</p>
              <h2>Here&apos;s where to go next</h2>
              <p className="greeter-copy">Based on your profile, these are your highest-value stops today</p>

              <section className="greeter-stop-card is-primary">
                <div className="greeter-stop-meta">
                  <span className="greeter-category">{routePayload.route.primary.category}</span>
                  <span className="greeter-stop-label">PRIMARY STOP</span>
                </div>
                <h3>{routePayload.route.primary.title}</h3>
                {routePayload.route.primary.products ? <p className="greeter-products">{routePayload.route.primary.products}</p> : null}
                {routePayload.route.primary.description ? <p className="greeter-description">{routePayload.route.primary.description}</p> : null}
                <p className="greeter-stop-label">YOUR FEEDBACK QUESTIONS</p>
                <ol className="greeter-feedback-list">
                  {feedbackQuestions.map((question) => <li key={question}>{question}</li>)}
                </ol>
              </section>

              {routePayload.route.secondary?.title ? (
                <section className="greeter-stop-card">
                  <div className="greeter-stop-meta">
                    <span className="greeter-category">{routePayload.route.secondary.category}</span>
                    <span className="greeter-stop-label">ALSO WORTH SEEING</span>
                  </div>
                  <h3>{routePayload.route.secondary.title}</h3>
                  {routePayload.route.secondary.products ? <p className="greeter-products">{routePayload.route.secondary.products}</p> : null}
                  {routePayload.route.secondary.description ? <p className="greeter-description">{routePayload.route.secondary.description}</p> : null}
                </section>
              ) : null}

              <button type="button" className="greeter-outline-btn" onClick={onStartOver}>← Start Over</button>
            </>
          ) : null}
        </article>
      </section>

      {started && showIdleCountdown ? (
        <div className="greeter-idle-countdown" aria-live="polite">
          Resetting in {idleSeconds}s
        </div>
      ) : null}
      <div className="greeter-screen-counter">Screen {stage === "welcome" ? 1 : stage === "question" ? questionStep + 2 : stage === "loading" ? 6 : 6} of 6</div>
    </main>
  );
};
