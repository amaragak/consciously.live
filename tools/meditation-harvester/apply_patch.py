import shutil, sys, pathlib, py_compile
p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding="utf-8")
i0 = s.find("<instructions>\nA short add-on to the writer's existing prompt.")
assert i0 >= 0, "instructions block not found"
i1 = s.find("</instructions>", i0)
NEW = """<instructions>
The pre-prompt for the writer, as markdown. It teaches HOW to write this style, not WHAT a typical one contains. The user's request decides the content (focus, theme, imagery, order, length); the brief gives the writer the method for turning any request into a good meditation of this style. Write techniques and decision rules, each with the reason it works, instead of fixed sequences or lists of content. Where the sources share a common choice, give it as the default for when the request leaves that open. Don't prescribe fixed content (particular body parts in a set order, particular scenes, particular affirmations or phrases); anything like that appears only as a labelled example. Everything is guidance the writer applies with judgement, and the user's request overrides it. Address the writer directly.

The app writes each session in phases: it first plans the session as a sequence of sections (each with a purpose, what it covers, and where it starts and ends), then writes each section separately with the whole plan in view. This brief is read both when planning and when writing a section.

Cover:
1. Mechanism: what this style does to the listener's attention and state, and how the writing produces it, so the writer can judge requests the brief doesn't anticipate.
2. Phases: how sessions of this style unfold and how to divide one into sections. Describe the kinds of phase this style is built from and what each achieves; how to tell where one phase ends and the next begins (a change of focus, technique, depth or direction); how phases tend to size relative to the whole session, and whether a longer session gains more phases or lets each one run longer; what carries across phases (a thread that builds, recurring phrasing or images, a technique that returns) and how; how one phase hands over to the next so separately written sections still read as one session; and the default arc when the request doesn't say.
3. How things are brought in and said: how a new focus, technique or image is introduced and developed; the anatomy of a good cue (what it names, how it invites, what it leaves open); sequencing cues within a phase; transitions; how repetition and signature phrasing are used and varied; how instructions are softened or made permissive; sentence length, person and tense, sensory detail, and keeping it plain; and how the user's own material (goals, journal entries, struggles, a specific request) is woven in. Illustrate with short lines you write yourself.
4. Pauses, briefly. Give a few principles in plain terms, not rules: a pause gives the listener time to do what the line before asked, so its length follows the task; how silence tends to grow as the session deepens; and where not to pause. Mention typical ranges from the measured data in passing only. No tables and no per-moment rules: the writer is trusted to judge each pause. Write pauses as {marker}, where N is the length in seconds.
5. Opening and closing: how to do each, and how to adapt them to the request.
6. Common mistakes and how to avoid them.
7. Worked example: invent a short, realistic user request for this style; show how you'd split it into phases (the purpose of each and what carries across), then a short excerpt (8–12 lines) from one phase showing how things are said and paused. Not a full script, no word counts.
Keep it tight enough to work as a pre-prompt: no preamble, no references to "the transcripts" or "the sources", under about 1,400 words.
"""
s = s[:i0] + NEW + s[i1:]
s = s.replace("What the writer needs from you is where pauses go and how long each one is.",
              "Pause guidance should stay light; the writer judges individual pauses.")
s = s.replace("Notes for the app's developer (not passed to the writer), under 200 words: what the sources share, where they differ, any source that doesn't fit this style, and what the pause patterns show.",
              "Notes for the app's developer (not passed to the writer), under 250 words: what the sources share, where they differ, how they divide into phases, any source that doesn't fit this style, and what the pause patterns show.")
s = s.replace("max_tokens=4000", "max_tokens=9000")
shutil.copyfile(p, str(p) + ".bak")
p.write_text(s, encoding="utf-8")
py_compile.compile(str(p), doraise=True)
print("patched")
