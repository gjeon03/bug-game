/**
 * English catalog — DEVELOPMENT FALLBACK ONLY. Never shipped as the default language.
 *
 * This is the extracted original wording, key-for-key with `ko.ts`. It exists so that:
 *   - a missing Korean key is visible in review rather than rendering as a raw key, and
 *   - a diff of `ko.ts` against `en.ts` proves the catalogs have not drifted apart.
 *
 * Keys must stay identical to `ko.ts`. Adding a key here without adding it there (or vice versa) is
 * the one failure this pair exists to catch.
 *
 * Where the original source branched on English plurals ("1 food line" / "2 food lines") or on
 * English letter case, the English here uses the plural form and lower case — Korean has neither, so
 * the key shape is driven by Korean and English follows.
 */
export const en = {
  /* ── meta / a11y ─────────────────────────────────────────────────────────── */
  'meta.lang': 'en',
  'meta.title': 'Baseboard Empire',
  'meta.description':
    'Baseboard Empire — a top-down macro-noir strategy game about growing a cockroach colony inside a hostile human kitchen.',
  'meta.noscript': 'Baseboard Empire needs JavaScript enabled to run.',
  'a11y.canvas': 'Baseboard Empire game view',
  'a11y.hudRegion': 'Status readout',

  /* ── shared units and cost fragments ─────────────────────────────────────── */

  'term.remaining': 'left',
  'term.operation': 'Operation',
  'term.capacityFull': 'capacity',
  'term.foothold': 'foothold',
  'term.adaptation': 'adaptation',
  'term.cost': 'needs',

  'unit.food': '{amount} food',
  'unit.water': '{amount} moisture',
  'unit.costBoth': '{food} food · {water} moisture',
  'unit.costBothProse': '{food} food, {water} moisture',
  'unit.roaches': '{count} roaches',
  'unit.seconds': '{seconds}s',
  'unit.percent': '{percent}%',
  'unit.tiles': '{count} tiles',
  'unit.foodNoun': 'food',
  'unit.waterNoun': 'moisture',

  /* ── HUD: meters ─────────────────────────────────────────────────────────── */
  'hud.meter.food': 'Food',
  'hud.meter.water': 'Moisture',
  'hud.meter.colony': 'Colony',
  'hud.meter.brood': 'Brood',
  'hud.meter.sprint': 'Sprint',
  'hud.meter.pheromone': 'Pheromone',
  'hud.meter.critical': ' ⚠ CRITICAL',

  /* ── HUD: scout status line ──────────────────────────────────────────────── */
  'hud.scout.ready': 'Scout ready',
  'hud.scout.dead': 'Scout lost — replacement in {seconds}s',
  'hud.scout.trapped': 'STUCK — mash SHIFT and a direction · {percent}%',
  'hud.scout.trapped.short': 'STUCK · SHIFT + direction {percent}%',
  'hud.scout.seen': 'SEEN — get to cover',
  'hud.scout.exposed': 'Exposed — in the light',
  'hud.scout.laying': 'Laying pheromone',

  /* ── HUD: interact prompt ────────────────────────────────────────────────── */
  'hud.prompt.inspect': 'Inspect {label}',
  'hud.prompt.costSuffix': ' — {cost}',

  /* ── HUD: operation panel ────────────────────────────────────────────────── */
  'hud.next': 'Next: {unlock}',
  'hud.theyAreComing': 'They are coming.',
  'hud.evidence.none': 'No evidence yet.',

  /* ── HUD: one-of-three choice ────────────────────────────────────────────── */
  'hud.choice.adaptation': 'The colony is ready to specialise — choose one',
  'hud.choice.adaptation.short': 'Ready to specialise — choose one',
  'hud.choice.fitOut': 'Fit out {label} — choose one',

  /* ── Alert: tier names (escalating register) ─────────────────────────────── */
  'alert.tier.0': 'Unnoticed',
  'alert.tier.1': "Something's off",
  'alert.tier.2': 'Infestation suspected',
  'alert.tier.3': 'Calling it in',
  'alert.tier.4': 'Extermination',

  /* ── Alert: what the household will do next ──────────────────────────────── */
  'alert.response.0': 'Nobody has noticed anything yet.',
  'alert.response.1': 'Next: someone will come in and turn the light on.',
  'alert.response.2': 'Next: sticky traps go down on your busiest floor routes.',
  'alert.response.3': 'Next: bait and longer patrols across the whole kitchen.',
  'alert.response.4': 'Next: the spray comes out and they go for the nest.',

  /* ── Alert: named evidence (why suspicion moved) ─────────────────────────── */
  'alert.cause.seen': 'A roach was seen in the light',
  'alert.cause.corpse': 'Bodies left in the open',
  'alert.cause.traffic': 'Heavy traffic across open floor',
  'alert.cause.depleted': 'Food visibly disturbed',
  'alert.cause.trap': 'A trap caught something',
  'alert.cause.expansion': 'New nest openings',
  'alert.cause.noise': 'Scuttling heard in the open',
  'alert.cause.droppings': 'Trails left on bare tile',

  /* ── Alert: forecast line (three shapes, matching the three code branches) ─ */
  'alert.forecast.withPlace': '{tier} — {cause}, worst around {place}. {next}',
  'alert.forecast.withPlace.short': '{tier} · {cause} · {place}. {next}',
  'alert.forecast.withCause': '{tier} — {cause}. {next}',
  'alert.forecast.bare': '{tier}. {next}',
  'alert.forecast.final':
    'EXTERMINATION — {seconds}s. They are spraying where your traffic was heaviest.',
  'alert.forecast.final.short': 'EXTERMINATION — {seconds}s. Spraying your busiest ground.',

  /* ── Threat: what they will try next, by alert tier ──────────────────────── */
  'threat.next.unknown': 'They have not worked out where yet.',
  'threat.next.0': 'Somebody may come through for a look.',
  'threat.next.1': 'Expect a wipe-down where the traffic is.',
  'threat.next.2': 'Expect traps on the routes they have noticed.',
  'threat.next.3': 'Expect bait, and spray if it gets worse.',
  'threat.next.4': 'They are ready to exterminate.',

  /* ── Threat: counterplay (shown once the player has met the threat) ──────── */
  'threat.counter.patrol': 'Stay under cabinetry — a torch beam only finds roaches on open floor.',
  'threat.counter.sweep':
    'A wipe erases scent, not roaches. Re-lay the line once the cloth passes.',
  'threat.counter.trap':
    'Traps land where your traffic went. Move the line and the trap is wasted.',
  'threat.counter.bait': 'Bait is slow. A roach that walks in has time to walk out.',
  'threat.counter.spray': 'Get everyone into a claimed crack. Spray cannot reach inside the walls.',
  'threat.counter.final': 'Claimed cracks are shelter. Everything outside one is exposed.',

  /* ── Threat: advice promoted into the objective line ─────────────────────── */
  'threat.advice.trapOnRoute':
    'A sticky trap is sitting on one of your supply lines — erase that stretch and re-route.',
  'threat.advice.baitOnRoute':
    'Bait has been put down on one of your lines — steer the trail around it.',
  'threat.advice.sweepIncoming': 'A cleaning pass is starting — the scent it crosses will be gone.',
  'threat.advice.final': 'Get the colony into claimed cracks and keep them there.',

  /* ── Routines: the household's night behaviours ──────────────────────────── */
  'routine.snack.title': 'Midnight snack',
  'routine.snack.warning': 'Footsteps in the hall. Somebody is going to the fridge.',
  'routine.snack.counter':
    'Fresh crumbs, under a flood of warm light. Take what you can before the door shuts.',
  'routine.dishes.title': 'Washing up',
  'routine.dishes.warning': 'The tap is running. The sink run is about to get wet and busy.',
  'routine.dishes.counter':
    'Standing water is free moisture — but the wiped floor kills scent where it passes.',
  'routine.trash.title': 'Bin run',
  'routine.trash.warning': 'The bin lid is up. Something rich just hit the floor by the door.',
  'routine.trash.counter':
    'The richest food in the kitchen, on the most exposed tile in the kitchen.',
  'routine.gone': 'The spill is gone — that trail went with it.',

  /* ── Operations: titles, briefs, unlocks ─────────────────────────────────── */
  'op.title': 'Operation {index} — {title}',
  'op.cardTitle': 'Operation {index}',
  'op.complete': 'Operation complete.',

  'op.1.title': 'Establish the nest',
  'op.1.brief':
    'Get out of the wall. Find something to eat and something to drink, and connect both to home.',
  'op.1.unlock': 'The household starts its night routines — and those are opportunities.',
  'op.2.title': 'Infiltrate the routines',
  'op.2.brief':
    'The house is awake in bursts. Be standing where the crumbs land, and get out before the light does.',
  'op.2.unlock': 'Adaptations: the colony starts specialising, and you choose how.',
  'op.3.title': 'Specialise the infestation',
  'op.3.brief':
    'Colonies that survive are colonies that commit. Pick what your roaches become — you cannot have all of it.',
  'op.3.unlock': 'The kitchen itself: hold three regions and ride out what the household sends.',
  'op.4.title': 'Claim the kitchen',
  'op.4.brief':
    'Three regions, held at once, while they come for you. This is the part they remember.',
  'op.4.unlock': 'The kitchen is yours.',

  /* ── Operations: checklist labels (fixed-width slot) ─────────────────────── */
  'op.gate.foodLine': '{count} food lines',
  'op.gate.waterLine': '{count} moisture lines',
  'op.gate.population': '{count} roaches',
  'op.gate.routines': 'Exploit {count} household routines',
  'op.gate.foothold': 'Claim {count} satellite footholds',
  'op.gate.adaptations': 'Choose {count} adaptations',
  'op.gate.functions': 'Install {count} foothold functions',
  'op.gate.zones': 'Hold {count} regions at once',
  'op.gate.survive': 'Survive the extermination',

  /* ── Operations: gate actions ────────────────────────────────────────────── */
  'op.action.findSource': 'Find a {noun} source — scout away from the crack.',
  'op.action.layTrail': 'Walk to {label}, then walk home holding the lay key to leave a trail.',
  'op.action.bringScentHome': 'Walk to {label} — then bring the scent home.',
  'op.action.keepBothFlowing':
    'Keep both reserves flowing — the colony grows on food and moisture together.',
  'op.action.waitForRoutine':
    'Wait for the house to move — then get a trail onto whatever it drops.',
  'op.action.routineIncoming': '{title} incoming — {counter}',
  'op.action.routineOpen': '{title} is open for {seconds}s — run a trail to it now.',
  'op.action.claimNest': 'Walk to {label} and press E to claim it.',
  'op.action.scoutForCrack': 'Scout the baseboards for a crack.',
  'op.action.pickAdaptation': 'Pick an adaptation — press 1, 2 or 3.',
  'op.action.growToMilestone': 'Grow to {count} roaches to open the next adaptation.',
  'op.action.keepGrowing': 'Keep the colony growing.',
  'op.action.fitOutHere': 'Stand in {label} and press E to fit it out.',
  'op.action.claimThenFit': 'Claim {label} first, then fit it out.',
  'op.action.claimAnother': 'Claim another crack.',
  'op.action.holdWhatYouHave': 'Hold what you have.',
  'op.action.holdInsurance': 'Hold. They will break a region if they can — a fourth is insurance.',
  'op.action.claimCrackInZone':
    'Claim {label} — a crack you own holds {zone} even while the colony is hiding.',
  'op.action.routeZone': 'Run a trail through {zone} — it holds at {percent}%.',
  'op.action.zoneEmpty': '{zone} has a trail but nobody on it ({percent}%).',
  'op.action.zoneStaff': 'Keep roaches working {zone} — {percent}% held.',
  'op.action.shelterNow': 'Get everyone into claimed cracks — {seconds}s left.',
  'op.action.triggerFinal': "Hold three regions to trigger the household's last answer.",

  /* ── Operations: blockers (the real reason progress stopped) ─────────────── */
  'op.blocker.routesFull': 'All {max} trails are in use — erase one before laying another.',
  'op.blocker.routesFullSpill':
    'All {max} trails are in use — erase one to reach the spill in time.',
  'op.blocker.trailUnfinished':
    'Your last trail does not reach both a source and a nest — finish the walk.',
  'op.blocker.capacityFull':
    'Nest capacity is full at {capacity}. Claim a foothold or take a brood adaptation to raise it.',
  'op.blocker.waterTooLow': 'Moisture is too low to raise brood. Get a moisture line running.',
  'op.blocker.foodTooLow': 'Food is too low to raise brood. Get a food line running.',
  'op.blocker.nestCostFood': '{label} needs {need} food — you have {have}.',
  'op.blocker.nestCostWater': '{label} needs {need} moisture — you have {have}.',
  'op.blocker.adaptCostFood': 'The cheapest adaptation costs {need} food — you have {have}.',
  'op.blocker.adaptCostWater': 'The cheapest adaptation costs {need} moisture — you have {have}.',
  'op.blocker.fitCostFood': 'Fitting out {label} needs {need} food — you have {have}.',
  'op.blocker.fitCostWater': 'Fitting out {label} needs {need} moisture — you have {have}.',
  'op.blocker.zoneContested':
    '{zone} is being worked by the household — hold is falling while they are there.',
  'op.blocker.noShelter':
    'Only the home crack can shelter anyone — a second claimed crack would split the risk.',
  'op.blocker.adaptationSaving': '{name} is waiting on {shortfall}.',
  'op.blocker.shortfallFood': '{amount} more food',
  'op.blocker.shortfallWater': '{amount} more moisture',

  /* ── Objective: the priority line (final response) ───────────────────────── */
  'objective.final.sprayOnZone': 'The spray is on {zone} — get them into a crack until it passes.',
  'objective.final.regain': 'Holding {held} of {need} — get bodies back into {zone}. {seconds}s.',
  'objective.final.holding': 'Holding {held} of {need} with {seconds}s left.',
  'objective.final.slipping': 'All {need} still yours, but {zone} is slipping — {seconds}s.',
  'objective.final.stayHidden': '{seconds}s. Keep all {need} regions and stay out of the open.',

  /* ── Objective: priority lines above the current gate ────────────────────── */
  'objective.adaptation.choose': 'Choose an adaptation — press 1, 2 or 3.',
  'objective.routine.incoming': '{title} in {seconds}s — {counter}',
  'objective.routine.active': '{title}: {seconds}s to get a trail onto it.',
  'objective.routine.harvesting': '{title} is paying out — {seconds}s left.',
  'objective.shortage.food': 'Food is running low — get another food line running.',
  'objective.shortage.water': 'Moisture is running low — get another moisture line running.',
  'objective.shortage.noFoodLine': 'No food line is connected at all.',
  'objective.shortage.noWaterLine': 'No moisture line is connected at all.',
  'objective.shortage.foodBehind': 'Your food line is not keeping up — add a second source.',
  'objective.shortage.waterBehind': 'Your moisture line is not keeping up — add a second source.',
  'objective.saving.food': '{amount} more food needed — get another food line running.',
  'objective.saving.water': '{amount} more moisture needed — get another moisture line running.',
  'objective.saving.forAdaptFood': '{blocker} Get another food line running.',
  'objective.saving.forAdaptWater': '{blocker} Get another moisture line running.',
  'objective.start': 'Leave the crack and find something to eat.',

  /* ── Objective: a capped reserve must always name a spend ────────────────── */
  'objective.capped.subjectBoth': 'Both reserves are',
  'objective.capped.subjectFood': 'The larder is',
  'objective.capped.subjectWater': 'Moisture is',
  'objective.capped.adaptation': '{subject} full — spend it: {name} costs {cost} food.',
  'objective.capped.claim': '{subject} full — claim {label} ({cost}). It raises your caps.',
  'objective.capped.fit': '{subject} full — fit out {label} ({cost}) to raise your ceiling.',
  'objective.capped.repair': '{subject} full — press E at {label} to repair it with moisture.',
  'objective.capped.capacity':
    '{subject} full and the nest is full at {capacity}. Capacity is the bottleneck — {label} needs {cost}.',
  'objective.capped.capacity.short':
    '{subject} full. Capacity is the bottleneck — {label} needs {cost}.',
  'objective.capped.milestone':
    '{subject} full — the reserve is the point: at {count} roaches you unlock a choice you will need it for.',
  'objective.capped.milestone.short':
    '{subject} full — at {count} roaches you unlock a choice for it.',
  'objective.capped.territory':
    '{subject} full. Reserves are no longer the bottleneck — territory is. Push a line into {zone}.',
  'objective.capped.hold': '{subject} full — hold what you have and ride out the response.',

  /* ── Adaptations: brood family ───────────────────────────────────────────── */
  'adaptation.brood1.name': 'Crowded nursery',
  'adaptation.brood1.blurb': 'Nest capacity +10. Eggs mature 35 % faster.',
  'adaptation.brood1.downside': 'Upkeep +25 %. More bodies means more traffic to notice.',
  'adaptation.brood2.name': 'Ootheca cluster',
  'adaptation.brood2.blurb':
    'Capacity +14. Losses are replaced at double rate for 20 s after a casualty.',
  'adaptation.brood2.downside': 'Upkeep +25 %. A cluster is a bigger thing to find.',
  'adaptation.brood3.name': 'Second generation',
  'adaptation.brood3.blurb':
    'Capacity +18. Nymphs mature in half the time and begin hauling immediately.',
  'adaptation.brood3.downside': 'Upkeep +30 %. Evidence from exposed traffic counts 20 % harder.',

  /* ── Adaptations: forage family ──────────────────────────────────────────── */
  'adaptation.forage1.name': 'Wider mandibles',
  'adaptation.forage1.blurb': 'Each roach carries 45 % more per trip.',
  'adaptation.forage1.downside': 'Sources drain 40 % faster, and a drained source is noticed.',
  'adaptation.forage2.name': 'Fast feeders',
  'adaptation.forage2.blurb': 'Feeding time halved; six roaches can work a source instead of four.',
  'adaptation.forage2.downside': 'Sources drain 40 % faster. Busier endpoints are easier to see.',
  'adaptation.forage3.name': 'Opportunists',
  'adaptation.forage3.blurb': 'Household spills yield double and last 50 % longer.',
  'adaptation.forage3.downside': 'Working a spill in the open doubles the evidence it leaves.',

  /* ── Adaptations: shadow family ──────────────────────────────────────────── */
  'adaptation.shadow1.name': 'Wall-hugging scent',
  'adaptation.shadow1.blurb':
    'Trails laid under cover last twice as long and leave 40 % less evidence.',
  'adaptation.shadow1.downside': 'Carrying is 12 % slower. Concealment is not free.',
  'adaptation.shadow2.name': 'Alarm pheromone',
  'adaptation.shadow2.blurb':
    'Roaches react to a threat 0.5 s sooner and run 30 % faster while fleeing.',
  'adaptation.shadow2.downside': 'Feeding is 15 % slower — a jumpy colony works less.',
  'adaptation.shadow3.name': 'Bolt-holes',
  'adaptation.shadow3.blurb':
    'Claimed cracks shelter from twice as far, and you gain 2 emergency evacuations.',
  'adaptation.shadow3.downside': 'Hauling is 15 % slower. Infrastructure costs throughput.',

  /* ── Foothold fit-outs ───────────────────────────────────────────────────── */
  'foothold.nursery.name': 'Nursery',
  'foothold.nursery.blurb': '+10 capacity, and brood hatches here.',
  'foothold.cache.name': 'Cache',
  'foothold.cache.blurb': '+90 food and +60 moisture storage.',
  'foothold.bolthole.name': 'Bolt-hole',
  'foothold.bolthole.blurb': '+2 capacity, and roaches shelter here from further away.',

  /* ── Hints: contextual toasts ────────────────────────────────────────────── */
  'hint.nothingHere': 'Nothing to inspect here.',
  'hint.sealed':
    '{label}: sealed until operation {op}. It will cost {food} food and {water} moisture.',
  'hint.resource': '{label}: {amount} {noun} left. Run a trail here.',
  'hint.repairCost': 'Patching the crack needs {amount} moisture.',
  'hint.repaired': '{label} patched to {percent}%.',
  'hint.fitCost': 'Fitting out {label} needs {food} food and {water} moisture.',
  'hint.fitChoose': '{label}: choose what to build — 1 nursery, 2 cache, 3 bolt-hole.',
  'hint.claimCost': '{label} needs {food} food and {water} moisture.',
  'hint.adaptCost': '{name} needs {food} food and {water} moisture.',
  'hint.tooPoorAdapt': 'Not enough in the larder yet.',
  'hint.tooPoorFit': 'Not enough in the larder to fit that out.',
  'hint.routeEvicted': 'Only {max} trails at once — the oldest one dissolved.',

  /* ── Interact prompt labels ──────────────────────────────────────────────── */
  'hud.target.sealed': '{label} — opens in operation {op}',
  'hud.target.claim': 'Claim {label}',
  'hud.target.fit': 'Fit out {label}',
  'hud.target.repair': 'Repair {label} — {percent}%',
  'hud.target.resource': '{label} — {amount} left',

  /* ── World-space guide arrow ─────────────────────────────────────────────── */
  'hud.guide': '{label} · {tiles} tiles',

  /* ── Places: kitchen regions (used mid-sentence, no capitalization) ──────── */
  'place.zone.sink': 'the sink run',
  'place.zone.dishwasher': 'the dishwasher',
  'place.zone.pantry': 'the pantry',
  'place.zone.stove': 'the stove',
  'place.zone.fridge': 'the refrigerator',
  'place.zone.island': 'the island',
  'place.zone.trash': 'the bin corner',
  'place.zone.doorway': 'the hall doorway',

  /* ── Places: coarse region names used in the forecast ────────────────────── */
  'place.region.sink': 'the sink',
  'place.region.dishwasher': 'the dishwasher',
  'place.region.pantry': 'the pantry',
  'place.region.stove': 'the stove',
  'place.region.fridge': 'the fridge',
  'place.region.trash': 'the bin corner',
  'place.region.door': 'the floor by the door',
  'place.region.island': 'the island',

  /* ── Places: resource nodes ──────────────────────────────────────────────── */
  'place.resource.dishCrumbs': 'Dishwasher crumbs',
  'place.resource.sinkDrip': 'Sink drip',
  'place.resource.stoveGrease': 'Stove grease',
  'place.resource.islandDrop': 'Island spill',
  'place.resource.fridgeCondensation': 'Fridge condensation',
  'place.resource.pantryGrain': 'Pantry grain',
  'place.resource.trashSpill': 'Bin spill',
  'place.resource.petBowl': 'Pet bowl',

  /* ── Places: cracks ──────────────────────────────────────────────────────── */
  'place.nest.home': 'Home crack',
  'place.nest.crackSink': 'Sink-run crack',
  'place.nest.crackIsland': 'Island crack',
  'place.nest.crackPantry': 'Pantry crack',
  'place.nest.crackStove': 'Stove-side crack',
  'place.nest.crackBin': 'Bin-corner crack',

  /* ── Tutorial: first-run beats. Short, imperative, one action each. ──────── */
  'tutorial.move': 'W A S D — get out of the crack.',
  'tutorial.cover': 'Hug the cabinets. Bare tile is where they see you.',
  'tutorial.inspect': 'E — inspect the crumbs or the sink drip.',
  'tutorial.lay': 'Hold SPACE while walking. Food → crack.',
  'tutorial.follow': 'The colony reads your trail. That is your first delivery.',
  'tutorial.both': 'Food breeds. Moisture keeps them alive. You need trails to both.',
  'tutorial.sprint': 'SHIFT sprints. It is loud, and loud on open floor gets noticed.',
  'tutorial.erase': 'X rubs a trail out. Tap it to recall everyone.',

  /* ── Pause card ──────────────────────────────────────────────────────────── */
  'pause.heading': 'Paused',
  'pause.wordmark': 'Baseboard Empire',
  'pause.lede': '{operation} · {tier} · {population} roaches',
  'pause.controlsHeading': 'Controls',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart run',

  /* ── Controls ────────────────────────────────────────────────────────────── */
  'control.move': 'Move the scout',
  'control.lay': 'Lay a pheromone trail',
  'control.erase': 'Rub out a trail · tap to recall',
  'control.interact': 'Inspect · claim a crack',
  'control.sprint': 'Sprint (loud, and it shows)',
  'control.pause': 'Pause',
  'control.restart': 'Restart',

  /* ── Help card ───────────────────────────────────────────────────────────── */
  'pause.help.heading': 'How this works',
  'pause.help.title': 'You are the scout, not the swarm',
  'pause.help.lede':
    'Workers never take orders. They read the pheromone you secrete with your own body — so the only route they can use is a route you personally walked.',
  'pause.help.linking':
    'Link a <strong>claimed nest</strong> at one end to <strong>food or moisture</strong> at the other and the colony starts hauling. Both ends pulse warm when a route is live.',
  'pause.help.evidence':
    'Every metre of open tile you route across is evidence. Evidence raises suspicion, suspicion brings feet, traps and finally spray. Suspicion never returns to zero — you are choosing how much risk to carry, not grinding it away.',
  'pause.help.back': 'Back',

  /* ── Operation card ──────────────────────────────────────────────────────── */
  'op.card.continue': 'Get to work',
  'op.card.stat.colony': 'Colony',
  'op.card.stat.food': 'Food',
  'op.card.stat.water': 'Moisture',
  'op.card.stat.adaptations': 'Adaptations',
  'op.card.stat.deliveries': 'Deliveries',
  'op.card.stat.lost': 'Lost',

  /* ── Outcome: end card ───────────────────────────────────────────────────── */
  'outcome.win.heading': 'Victory',
  'outcome.lose.heading': 'Run over',
  'outcome.subheading': '{heading} · operation {operation} of 4',
  'outcome.win.title': 'The kitchen is yours',
  'outcome.lose.collapse.title': 'Colony collapsed',
  'outcome.lose.nestDestroyed.title': 'Nest destroyed',
  'outcome.lose.exterminated.title': 'Exterminated',
  'outcome.win.lede':
    'The can is empty and you are still here. {zones} They will never get all of you now.',
  'outcome.win.ledeZones': 'You hold {zones}.',
  'outcome.lose.collapse.lede': 'Nothing left to send out. The last of the brood died in the dark.',
  'outcome.lose.nestDestroyed.lede': 'They found the home crack and emptied a can into it.',
  'outcome.lose.exterminated.lede':
    'The sweep finished, and it finished you. The kitchen is quiet.',
  'outcome.killedBy': '<strong>What killed them:</strong> {cause} — {count} roaches.',
  'outcome.killedByNothing':
    '<strong>What killed them:</strong> nothing reached them — the colony simply ran out.',
  'outcome.topEvidence': ' <strong>Biggest evidence source:</strong> {cause} ({amount} suspicion).',
  'outcome.zoneLine': 'Hold {zone}',
  'outcome.became':
    '<strong>This colony became:</strong> {list}. A different set is a different run.',
  'outcome.neverSpecialised':
    'This colony never specialised. Adaptations open at 11, 17, 24 and 30 roaches.',
  'outcome.best': 'Best run: {result} · {population} roaches · {time}',
  'outcome.best.survived': 'survived',
  'outcome.best.lost': 'lost',
  'outcome.restart': 'Run it again',
  'outcome.help': 'How this works',

  /* ── Outcome: stats ──────────────────────────────────────────────────────── */
  'outcome.stat.runTime': 'Run time',
  'outcome.stat.deliveries': 'Deliveries',
  'outcome.stat.hatched': 'Hatched',
  'outcome.stat.lost': 'Lost',
  'outcome.stat.scoutDeaths': 'Scout deaths',
  'outcome.stat.peakSuspicion': 'Peak suspicion',
  'outcome.stat.trapsSprung': 'Traps sprung',
  'outcome.stat.peakColony': 'Peak colony',

  /* ── Outcome: what killed them ───────────────────────────────────────────── */
  'outcome.death.foot': 'crushed underfoot',
  'outcome.death.trap': 'caught on sticky traps',
  'outcome.death.spray': 'killed by spray',
  'outcome.death.bait': 'poisoned by bait',
  'outcome.death.starve': 'starved — the larder ran dry',
  'outcome.death.thirst': 'died of thirst — no moisture reached them',

  /* ── Settings ────────────────────────────────────────────────────────────── */
  'settings.master': 'Master volume',
  'settings.music': 'Ambience',
  'settings.sfx': 'Effects',
  'settings.muted': 'Mute everything',
  'settings.reducedShake': 'Reduced screen shake',
  'settings.reducedFlash': 'Reduced flashes',
  'settings.highContrast': 'Brighter kitchen (readability)',
  'settings.showPerf': 'Show performance readout',

  /* ── Errors ──────────────────────────────────────────────────────────────── */
  'error.saveFailed': 'Settings could not be saved. Browser storage may be blocked.',
  'error.loadFailed': 'Saved settings could not be read — starting from defaults.',
  'error.audioBlocked': 'Sound starts after you click the page once.',
  'error.runtime': 'Something went wrong. Press R to start again.',
} as const;

export type EnKey = keyof typeof en;
