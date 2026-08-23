(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MultiChurchModules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function activePeople(state) {
    return state.people.filter(function (person) { return person.active; });
  }

  function uniqueTeams(state) {
    var teams = [];
    state.people.forEach(function (person) {
      (person.teams || []).forEach(function (team) {
        if (team && teams.indexOf(team) === -1) teams.push(team);
      });
    });
    return teams;
  }

  function dashboardSummary(state) {
    return {
      activePeople: activePeople(state).length,
      teams: uniqueTeams(state).length,
      publishedAssignments: state.assignments.filter(function (item) { return item.status === 'published'; }).length,
      newcomerAttention: state.newcomers.filter(function (item) { return item.status === '待分派' || item.status === '跟進中'; }).length,
      venuePending: state.venueRequests.filter(function (item) { return item.status === 'pending'; }).length
    };
  }

  function overlaps(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
  }

  function venueConflicts(state, request) {
    if (!request || request.status === 'cancelled' || request.status === 'rejected') return [];
    return state.venueRequests.filter(function (other) {
      if (other.id === request.id || other.venueId !== request.venueId || other.date !== request.date) return false;
      if (other.status === 'cancelled' || other.status === 'rejected') return false;
      return overlaps(request.start, request.end, other.start, other.end);
    });
  }

  function personName(state, personId) {
    var person = state.people.find(function (item) { return item.id === personId; });
    return person ? person.name : '未分派';
  }

  function newcomerName(state, newcomerId) {
    var newcomer = state.newcomers.find(function (item) { return item.id === newcomerId; });
    return newcomer ? newcomer.name : '未知新人';
  }

  return {
    dashboardSummary: dashboardSummary,
    newcomerName: newcomerName,
    personName: personName,
    uniqueTeams: uniqueTeams,
    venueConflicts: venueConflicts
  };
});
