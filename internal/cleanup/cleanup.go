package cleanup

import (
	"context"
	"log"
	"time"

	"github.com/The-Conos-Project/hackploy-platform/internal/dockerx"
	"github.com/The-Conos-Project/hackploy-platform/internal/store"
)

// StartExpiredLabs periodically stops labs past expires_at.
func StartExpiredLabs(st *store.Store, every time.Duration) {
	if every <= 0 {
		every = time.Minute
	}
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for range t.C {
			reap(st)
		}
	}()
}

func reap(st *store.Store) {
	list, err := st.ListRunningInstances()
	if err != nil {
		return
	}
	now := time.Now().UTC()
	for i := range list {
		inst := &list[i]
		if inst.ExpiresAt == nil || !inst.ExpiresAt.Before(now) {
			continue
		}
		if inst.ContainerID != "" {
			if err := dockerx.StopLab(context.Background(), inst.ContainerID); err != nil {
				log.Printf("cleanup: stop %s: %v", inst.ID, err)
			}
		}
		inst.Status = "expired"
		if err := st.UpdateInstance(inst); err != nil {
			log.Printf("cleanup: save %s: %v", inst.ID, err)
		}
	}
}
