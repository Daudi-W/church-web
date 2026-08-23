(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultiChurchDomain = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEVEL_ORDER = { ok: 0, warn: 1, block: 2 };

  function sameDate(a, b) {
    return a && b && a.date === b.date;
  }

  function eventById(state, eventId) {
    return state.events.find(function (event) { return event.id === eventId; });
  }

  function roleById(state, roleId) {
    return state.roles.find(function (role) { return role.id === roleId; });
  }

  function personById(state, personId) {
    return state.people.find(function (person) { return person.id === personId; });
  }

  function assignmentsForPerson(state, personId) {
    return state.assignments.filter(function (item) { return item.personId === personId && item.status !== 'cancelled'; });
  }

  function configuredLevel(state, code, fallback) {
    var configured = state.settings && state.settings.rules && state.settings.rules[code];
    if (configured === 'ignore') return null;
    if (configured === 'block' || configured === 'warn') return configured;
    return fallback;
  }

  function evaluateCandidate(state, person, event, role) {
    var reasons = [];
    var level = 'ok';
    function add(nextLevel, code, text) {
      reasons.push({ level: nextLevel, code: code, text: text });
      if (LEVEL_ORDER[nextLevel] > LEVEL_ORDER[level]) level = nextLevel;
    }

    function addConfigured(code, fallback, text) {
      var configured = configuredLevel(state, code, fallback);
      if (configured) add(configured, code, text);
    }

    if (!person.active) add('block', 'PERSON_DISABLED', '人員目前停用');
    if (person.leaveEventIds.indexOf(event.id) !== -1) addConfigured('ON_LEAVE', 'block', '這場已請假');
    if (person.skills.indexOf(role.id) === -1) addConfigured('NO_SKILL', 'warn', '沒有這個崗位資格');

    var current = assignmentsForPerson(state, person.id);
    current.forEach(function (assignment) {
      var assignedEvent = eventById(state, assignment.eventId);
      var assignedRole = roleById(state, assignment.roleId);
      if (!assignedEvent || !assignedRole) return;
      if (assignedEvent.id === event.id && assignedRole.id === role.id) return;
      if (assignedEvent.id === event.id) {
        var compatible = state.compatiblePairs.some(function (pair) {
          return pair.indexOf(role.id) !== -1 && pair.indexOf(assignedRole.id) !== -1;
        });
        if (!compatible) addConfigured('SAME_EVENT_CONFLICT', 'block', '同場已排「' + assignedRole.name + '」');
      } else if (sameDate(assignedEvent, event)) {
        addConfigured('SAME_DAY_OTHER_EVENT', 'warn', '同日已排「' + assignedEvent.name + '」');
      }
    });

    if (current.length >= person.recommendedMax) {
      addConfigured('FREQUENCY_HIGH', 'warn', '本期已排 ' + current.length + ' 次');
    }

    if (!reasons.length) reasons.push({ level: 'ok', code: 'AVAILABLE', text: '有資格且目前可排' });
    return { person: person, level: level, reasons: reasons };
  }

  function candidateList(state, eventId, roleId) {
    var event = eventById(state, eventId);
    var role = roleById(state, roleId);
    if (!event || !role) return [];
    return state.people.map(function (person) {
      return evaluateCandidate(state, person, event, role);
    }).sort(function (a, b) {
      var levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
      if (levelDiff) return levelDiff;
      var countDiff = assignmentsForPerson(state, a.person.id).length - assignmentsForPerson(state, b.person.id).length;
      if (countDiff) return countDiff;
      return a.person.name.localeCompare(b.person.name, 'zh-Hant');
    });
  }

  function publishedAssignments(state) {
    return state.assignments.filter(function (item) {
      return item.status === 'published' && item.personId;
    });
  }

  function personalAssignments(state, personId) {
    return publishedAssignments(state).filter(function (item) {
      return item.personId === personId;
    }).map(function (item) {
      return {
        assignment: item,
        event: eventById(state, item.eventId),
        role: roleById(state, item.roleId)
      };
    }).sort(function (a, b) {
      return (a.event.date + a.event.start).localeCompare(b.event.date + b.event.start);
    });
  }

  function displayDate(dateText) {
    var parts = dateText.split('-');
    return Number(parts[1]) + '/' + Number(parts[2]);
  }

  function generateLineText(state) {
    var churchName = state.church && state.church.name ? state.church.name : '教會';
    var lines = ['【' + churchName + '｜本週服事】'];
    state.events.forEach(function (event) {
      lines.push('', displayDate(event.date) + ' ' + event.name);
      state.roles.forEach(function (role) {
        var matches = publishedAssignments(state).filter(function (item) {
          return item.eventId === event.id && item.roleId === role.id;
        });
        if (matches.length) {
          lines.push(role.name + '｜' + matches.map(function (item) {
            var person = personById(state, item.personId);
            return person ? person.name : '';
          }).filter(Boolean).join('、'));
        } else if (role.required) {
          lines.push(role.name + '｜缺 1 人');
        }
      });
    });
    lines.push('', '異動請以個人服事頁為準。');
    return lines.join('\n');
  }

  function scheduleIssues(state) {
    var blocks = [];
    var warnings = [];
    state.events.forEach(function (event) {
      state.roles.forEach(function (role) {
        var match = state.assignments.find(function (item) {
          return item.eventId === event.id && item.roleId === role.id && item.status !== 'cancelled' && item.personId;
        });
        if (role.required && !match) {
          var gapSetting = state.settings && state.settings.rules && state.settings.rules.REQUIRED_GAP;
          if (gapSetting === 'warn') warnings.push(event.name + '「' + role.name + '」缺 1 人');
          else if (gapSetting !== 'ignore') blocks.push(event.name + '「' + role.name + '」缺 1 人');
        }
        if (match) {
          var result = evaluateCandidate(state, personById(state, match.personId), event, role);
          result.reasons.forEach(function (reason) {
            if (reason.level === 'block') blocks.push(event.name + '「' + role.name + '」：' + reason.text);
            if (reason.level === 'warn') warnings.push(event.name + '「' + role.name + '」：' + reason.text);
          });
        }
      });
    });
    return { blocks: blocks, warnings: warnings };
  }

  return {
    candidateList: candidateList,
    generateLineText: generateLineText,
    personalAssignments: personalAssignments,
    scheduleIssues: scheduleIssues,
    personById: personById,
    eventById: eventById,
    roleById: roleById
  };
});
