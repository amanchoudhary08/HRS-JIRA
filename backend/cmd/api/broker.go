package main

import "sync"

type eventBroker struct {
	mu      sync.Mutex
	clients map[string]map[chan sseEvent]struct{}
}

func newBroker() *eventBroker {
	return &eventBroker{clients: make(map[string]map[chan sseEvent]struct{})}
}

func (b *eventBroker) subscribe(projectID string) chan sseEvent {
	ch := make(chan sseEvent, 16)
	b.mu.Lock()
	if b.clients[projectID] == nil {
		b.clients[projectID] = make(map[chan sseEvent]struct{})
	}
	b.clients[projectID][ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *eventBroker) unsubscribe(projectID string, ch chan sseEvent) {
	b.mu.Lock()
	if subs, ok := b.clients[projectID]; ok {
		delete(subs, ch)
	}
	b.mu.Unlock()
}

func (b *eventBroker) publish(projectID string, ev sseEvent) {
	b.mu.Lock()
	subs := b.clients[projectID]
	channels := make([]chan sseEvent, 0, len(subs))
	for ch := range subs {
		channels = append(channels, ch)
	}
	b.mu.Unlock()
	for _, ch := range channels {
		select {
		case ch <- ev:
		default:
		}
	}
}
