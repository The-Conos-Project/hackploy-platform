package api

import "strings"

// isNonScoringSubject is true for admin practice subjects (root). Their
// instances validate flags for testing but never appear on boards, first blood,
// or profile points.
func isNonScoringSubject(userID string) bool {
	id := strings.ToLower(strings.TrimSpace(userID))
	return id == "" || id == "root" || id == "admin"
}
