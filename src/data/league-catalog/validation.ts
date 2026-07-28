import type {
  ClubDefinition,
  CompetitionDefinition,
  LeagueSystemDefinition,
  MovementRules,
  PositionRule,
} from './types';

function duplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach(value => {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return [...repeated];
}

function validateMovement(
  competition: CompetitionDefinition,
  movement: MovementRules | undefined,
  competitionIds: Set<string>,
  errors: string[],
) {
  if (!movement) return;
  const participantCount = competition.groups
    ? Object.values(competition.groups)[0]?.length ?? 0
    : competition.clubIds.length;
  const groupCount = competition.groups
    ? Object.keys(competition.groups).length
    : 1;
  const occupiedPositions = new Map<number, string>();
  for (const [kind, rule] of Object.entries(movement) as [
    string,
    PositionRule | undefined,
  ][]) {
    if (!rule) continue;
    if (rule.places <= 0 || !Number.isInteger(rule.places)) {
      errors.push(`${competition.id}.${kind}: places must be a positive integer`);
    }
    if (!rule.positions.length || rule.positions.some(position =>
      !Number.isInteger(position) || position < 1 || position > participantCount
    )) {
      errors.push(`${competition.id}.${kind}: invalid table position`);
    }
    if (duplicates(rule.positions.map(String)).length) {
      errors.push(`${competition.id}.${kind}: duplicate positions`);
    }
    const eligibleCount = rule.positions.length
      * (competition.groups && rule.scope === 'competition' ? groupCount : 1);
    if (rule.places > eligibleCount) {
      errors.push(`${competition.id}.${kind}: places exceed eligible clubs`);
    }
    if (kind === 'automatic' && rule.places !== rule.positions.length) {
      errors.push(`${competition.id}.${kind}: automatic places must match positions`);
    }
    if (rule.scope === 'per-group' && !competition.groups) {
      errors.push(`${competition.id}.${kind}: per-group scope requires groups`);
    }
    if (competition.groups && !rule.scope) {
      errors.push(`${competition.id}.${kind}: grouped competition requires an explicit scope`);
    }
    if (Boolean(rule.externalBoundary) === Boolean(rule.destinationCompetitionId)) {
      errors.push(
        `${competition.id}.${kind}: exactly one destination or external boundary is required`,
      );
    }
    if (
      rule.destinationCompetitionId
      && !competitionIds.has(rule.destinationCompetitionId)
    ) {
      errors.push(`${competition.id}.${kind}: unknown destination ${rule.destinationCompetitionId}`);
    }
    rule.positions.forEach(position => {
      const previousKind = occupiedPositions.get(position);
      if (previousKind) {
        errors.push(
          `${competition.id}: ${previousKind} and ${kind} overlap at position ${position}`,
        );
      } else {
        occupiedPositions.set(position, kind);
      }
    });
  }
}

function movementPlaces(
  competition: CompetitionDefinition,
  rules: MovementRules | undefined,
  destinationCompetitionId: string,
) {
  if (!rules) return 0;
  return (Object.values(rules) as (PositionRule | undefined)[]).reduce(
    (total, rule) => {
      if (!rule || rule.destinationCompetitionId !== destinationCompetitionId) {
        return total;
      }
      const groupMultiplier =
        competition.groups && rule.scope === 'per-group'
          ? Object.keys(competition.groups).length
          : 1;
      return total + rule.places * groupMultiplier;
    },
    0,
  );
}

function validateTransitionBalance(
  system: LeagueSystemDefinition,
  errors: string[],
) {
  const byId = new Map(
    system.competitions.map(competition => [competition.id, competition]),
  );
  const checked = new Set<string>();

  system.competitions.forEach(source => {
    const destinations = new Set(
      [
        ...Object.values(source.promotion ?? {}),
        ...Object.values(source.relegation ?? {}),
      ]
        .map(rule => rule?.destinationCompetitionId)
        .filter((id): id is string => Boolean(id)),
    );

    destinations.forEach(destinationId => {
      const destination = byId.get(destinationId);
      if (!destination) return;
      const pairKey = [source.id, destination.id].sort().join('|');
      if (checked.has(pairKey)) return;
      checked.add(pairKey);

      const upper = source.tier < destination.tier ? source : destination;
      const lower = source.tier < destination.tier ? destination : source;
      const relegated = movementPlaces(upper, upper.relegation, lower.id);
      const promoted = movementPlaces(lower, lower.promotion, upper.id);
      if (relegated !== promoted) {
        errors.push(
          `${system.id}: ${upper.id} relegates ${relegated} but `
          + `${lower.id} promotes ${promoted}`,
        );
      }
    });
  });
}

export function validateLeagueCatalog(
  systems: readonly LeagueSystemDefinition[],
  clubs: readonly ClubDefinition[],
) {
  const errors: string[] = [];
  const clubIds = new Set(clubs.map(club => club.id));
  const clubById = new Map(clubs.map(club => [club.id, club]));
  const duplicateClubIds = duplicates(clubs.map(club => club.id));
  if (duplicateClubIds.length) errors.push(`duplicate club ids: ${duplicateClubIds.join(', ')}`);
  const crestSourceOwners = new Map<string, string[]>();
  clubs.forEach(club => {
    if (!club.crestSourceUrl) return;
    const owners = crestSourceOwners.get(club.crestSourceUrl) ?? [];
    owners.push(club.id);
    crestSourceOwners.set(club.crestSourceUrl, owners);
  });
  crestSourceOwners.forEach((owners, sourceUrl) => {
    if (owners.length > 1) {
      errors.push(
        `crest source reused by distinct clubs ${owners.join(', ')}: ${sourceUrl}`,
      );
    }
  });
  const providerClubIds = new Map<string, string[]>();
  clubs.forEach(club => {
    Object.entries(club.providerIds ?? {}).forEach(([provider, providerId]) => {
      const key = `${provider}:${providerId}`;
      const owners = providerClubIds.get(key) ?? [];
      owners.push(club.id);
      providerClubIds.set(key, owners);
    });
  });
  providerClubIds.forEach((owners, providerId) => {
    if (owners.length > 1) {
      errors.push(
        `provider club id ${providerId} reused by ${owners.join(', ')}`,
      );
    }
  });

  const competitions = systems.flatMap(system => system.competitions);
  const duplicateCompetitionIds = duplicates(competitions.map(competition => competition.id));
  if (duplicateCompetitionIds.length) {
    errors.push(`duplicate competition ids: ${duplicateCompetitionIds.join(', ')}`);
  }

  clubs.forEach(club => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(club.id)) {
      errors.push(`${club.id}: club id is not URL/storage safe`);
    }
    if (!/^#[0-9A-F]{6}$/i.test(club.color) || !/^#[0-9A-F]{6}$/i.test(club.secondaryColor)) {
      errors.push(`${club.id}: invalid color`);
    }
    if (club.crestSourceUrl && !/^https:\/\//.test(club.crestSourceUrl)) {
      errors.push(`${club.id}: crest source must use HTTPS`);
    }
    Object.entries(club.providerIds ?? {}).forEach(([provider, providerId]) => {
      if (!providerId.trim()) {
        errors.push(`${club.id}: empty ${provider} provider id`);
      }
    });
    if (club.parentClubId && !clubIds.has(club.parentClubId)) {
      errors.push(`${club.id}: unknown parent club ${club.parentClubId}`);
    }
    if (
      club.parentClubId
      && clubById.get(club.parentClubId)?.countryCode !== club.countryCode
    ) {
      errors.push(`${club.id}: parent club must belong to the same country`);
    }
    if (!club.name.trim() || !club.nameKo.trim() || !/^[A-Z0-9]{2,4}$/.test(club.abbr)) {
      errors.push(`${club.id}: invalid display identity`);
    }
    if (!club.crestUrl.endsWith(`/${club.id}.png`)) {
      errors.push(`${club.id}: crest path must be stable and club-id based`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(club.identityVerifiedAt)) {
      errors.push(`${club.id}: invalid identity verification date`);
    }
    if (
      club.structuralTier !== undefined
      && (
        !Number.isFinite(club.structuralTier)
        || club.structuralTier < 0
        || club.structuralTier > 1
      )
    ) {
      errors.push(`${club.id}: structural tier must be between 0 and 1`);
    }
  });

  systems.forEach(system => {
    const [firstProfessionalTier, lastProfessionalTier] = system.professionalTierRange;
    const rosteredInSystem = new Map<string, string>();
    const systemCompetitionIds = new Set(
      system.competitions.map(competition => competition.id),
    );
    const duplicateTiers = duplicates(
      system.competitions.map(competition => String(competition.tier)),
    );
    if (duplicateTiers.length) {
      errors.push(`${system.id}: duplicate competition tiers ${duplicateTiers.join(', ')}`);
    }
    system.sources?.forEach(source => {
      if (
        !source.label.trim()
        || !/^https:\/\//.test(source.url)
        || !/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt)
      ) {
        errors.push(`${system.id}: invalid source reference`);
      }
    });
    system.competitions.forEach(competition => {
      if (competition.countryCode !== system.countryCode) {
        errors.push(`${competition.id}: country does not match ${system.id}`);
      }
      const sourceReferences = [
        {
          label: `${competition.name} roster`,
          url: competition.season.sourceUrl,
          verifiedAt: competition.season.verifiedAt,
        },
        ...(competition.rulesSources ?? []),
      ];
      sourceReferences.forEach(source => {
        if (
          !source.label.trim()
          || !/^https:\/\//.test(source.url)
          || !/^\d{4}-\d{2}-\d{2}$/.test(source.verifiedAt)
        ) {
          errors.push(`${competition.id}: invalid source reference`);
        }
      });
      const expectedSeasonId =
        `${competition.season.startYear}-${String(
          (competition.season.startYear + 1) % 100,
        ).padStart(2, '0')}`;
      if (competition.season.id !== expectedSeasonId) {
        errors.push(`${competition.id}: season id does not match start year`);
      }
      const { win, draw, loss } = competition.points;
      if (
        ![win, draw, loss].every(value => Number.isFinite(value))
        || win <= draw
        || draw < loss
      ) {
        errors.push(`${competition.id}: invalid points rules`);
      }
      if (
        !competition.tieBreakers.length
        || duplicates([...competition.tieBreakers]).length
      ) {
        errors.push(`${competition.id}: invalid tie-breaker sequence`);
      }
      competition.decisivePlayoffs?.forEach(playoff => {
        const [first, second] = playoff.positions;
        if (
          first < 1
          || second > competition.expectedClubCount
          || second !== first + 1
        ) {
          errors.push(`${competition.id}: invalid decisive playoff positions`);
        }
      });
      const repeatedPlayoffPositions = duplicates(
        competition.decisivePlayoffs?.map(
          playoff => playoff.positions.join('-'),
        ) ?? [],
      );
      if (repeatedPlayoffPositions.length) {
        errors.push(
          `${competition.id}: duplicate decisive playoff position(s) `
          + repeatedPlayoffPositions.join(', '),
        );
      }
      const shouldBeProfessional =
        competition.tier >= firstProfessionalTier && competition.tier <= lastProfessionalTier;
      if (competition.professional !== shouldBeProfessional) {
        errors.push(`${competition.id}: professional flag contradicts ${system.id} tier range`);
      }
      if (competition.clubIds.length + (competition.openSlots ?? 0) !== competition.expectedClubCount) {
        errors.push(
          `${competition.id}: ${competition.clubIds.length} clubs + ${competition.openSlots ?? 0} open slots `
          + `does not equal expected ${competition.expectedClubCount}`,
        );
      }
      const repeated = duplicates(competition.clubIds);
      if (repeated.length) errors.push(`${competition.id}: duplicate clubs ${repeated.join(', ')}`);
      const repeatedAbbreviations = duplicates(
        competition.clubIds
          .map(id => clubById.get(id)?.abbr)
          .filter((abbr): abbr is string => Boolean(abbr)),
      );
      if (repeatedAbbreviations.length) {
        errors.push(
          `${competition.id}: duplicate abbreviations ${repeatedAbbreviations.join(', ')}`,
        );
      }
      competition.clubIds.forEach(id => {
        if (!clubIds.has(id)) errors.push(`${competition.id}: unknown club ${id}`);
        if (clubById.get(id)?.countryCode !== competition.countryCode) {
          errors.push(`${competition.id}: ${id} belongs to another country`);
        }
        const previous = rosteredInSystem.get(id);
        if (previous) errors.push(`${id}: rostered in both ${previous} and ${competition.id}`);
        rosteredInSystem.set(id, competition.id);
      });
      if (competition.groups) {
        const flattened = Object.values(competition.groups).flat();
        const groupSizes = Object.values(competition.groups).map(group => group.length);
        if (
          flattened.length !== competition.clubIds.length
          || new Set(flattened).size !== new Set(competition.clubIds).size
          || flattened.some(id => !competition.clubIds.includes(id))
        ) {
          errors.push(`${competition.id}: flat roster and group rosters differ`);
        }
        if (
          !groupSizes.length
          || groupSizes.some(size => size !== groupSizes[0])
          || groupSizes.some(size => size < 2 || size % 2 !== 0)
        ) {
          errors.push(`${competition.id}: groups must be non-empty, equally sized and even`);
        }
      } else if (
        competition.expectedClubCount % 2 !== 0
        && competition.rosterStatus === 'verified'
      ) {
        errors.push(`${competition.id}: verified round-robin roster must have an even club count`);
      }
      validateMovement(competition, competition.promotion, systemCompetitionIds, errors);
      validateMovement(competition, competition.relegation, systemCompetitionIds, errors);
      for (const [direction, rules] of [
        ['promotion', competition.promotion],
        ['relegation', competition.relegation],
      ] as const) {
        for (const rule of Object.values(rules ?? {}) as (PositionRule | undefined)[]) {
          if (!rule?.destinationCompetitionId) continue;
          const destination = system.competitions.find(
            candidate => candidate.id === rule.destinationCompetitionId,
          );
          if (!destination) continue;
          const expectedTier = direction === 'promotion'
            ? competition.tier - 1
            : competition.tier + 1;
          if (destination.tier !== expectedTier) {
            errors.push(
              `${competition.id}: ${direction} destination `
              + `${destination.id} must be adjacent tier ${expectedTier}`,
            );
          }
        }
      }
    });
    validateTransitionBalance(system, errors);
  });
  return errors;
}

export function assertLeagueCatalogValid(
  systems: readonly LeagueSystemDefinition[],
  clubs: readonly ClubDefinition[],
) {
  const errors = validateLeagueCatalog(systems, clubs);
  if (errors.length) {
    throw new Error(`Invalid league catalog:\n- ${errors.join('\n- ')}`);
  }
}
