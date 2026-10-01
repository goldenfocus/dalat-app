package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// pairTimeout bounds how long `pair` waits for the phone to enter the code.
const pairTimeout = 10 * time.Minute

// storeDSN is the whatsmeow session store (relative to the working directory).
const storeDSN = "file:store.db?_foreign_keys=on"

// newWAClient opens the session store and returns a client for its first device.
func newWAClient(ctx context.Context) *whatsmeow.Client {
	container, err := sqlstore.New(ctx, "sqlite3", storeDSN, waLog.Stdout("Database", "WARN", true))
	if err != nil {
		fatal("session store: %v", err)
	}
	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		fatal("session store: %v", err)
	}
	return whatsmeow.NewClient(deviceStore, waLog.Stdout("Client", "INFO", true))
}

// runPair links this process as a WhatsApp linked device using an 8-digit
// phone-number pairing code instead of a QR scan:
//
//	./whatsapp-ingest pair --phone 84123456789
//
// The code is printed as "PAIRING CODE: XXXX-XXXX". On the phone: WhatsApp →
// Linked devices → Link a device → Link with phone number instead.
func runPair(args []string) {
	fs := flag.NewFlagSet("pair", flag.ExitOnError)
	phoneFlag := fs.String("phone", "", "bot phone number in E.164 digits, e.g. 84123456789")
	_ = fs.Parse(args)
	phone := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, *phoneFlag)
	if len(phone) < 8 {
		fatal("pair: --phone <E.164 digits> is required")
	}

	ctx := context.Background()
	client := newWAClient(ctx)
	if client.Store.ID != nil {
		fatal("pair: store.db is already paired as %s — move it aside to re-pair", client.Store.ID)
	}

	done := make(chan struct{}, 1)
	client.AddEventHandler(func(evt any) {
		switch v := evt.(type) {
		case *events.QR:
			// The server is ready for pairing; request a phone code instead of
			// showing the QR. Runs again after a reconnect, issuing a fresh code.
			go func() {
				code, err := client.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
				if err != nil {
					logf("PairPhone failed: %v", err)
					return
				}
				fmt.Printf("\nPAIRING CODE: %s\n\n", code)
				logf("enter it on the phone: WhatsApp → Linked devices → Link a device → Link with phone number instead")
			}()
		case *events.PairSuccess:
			logf("pairing successful: %s (%s)", v.ID, v.Platform)
		case *events.PairError:
			logf("pairing error: %v", v.Error)
		case *events.Connected:
			if client.Store.ID != nil {
				select {
				case done <- struct{}{}:
				default:
				}
			}
		case *events.LoggedOut:
			fatal("logged out during pairing: %v", v.Reason)
		}
	})

	if err := client.Connect(); err != nil {
		fatal("connect: %v", err)
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	select {
	case <-done:
		// Give the initial post-pair sync a moment to persist before exiting.
		time.Sleep(5 * time.Second)
		logf("paired and connected as %s — session saved in store.db", client.Store.ID)
		client.Disconnect()
	case <-time.After(pairTimeout):
		client.Disconnect()
		fatal("pair: no pairing within %s", pairTimeout)
	case <-sig:
		client.Disconnect()
		fatal("pair: interrupted")
	}
}

// runGroups prints every group the paired account has joined as JID<TAB>name.
// Use the JIDs for WHATSAPP_GROUP_JIDS. With -v it adds the community (parent)
// JID and flags: community = community parent, announce = admin-only posting.
func runGroups(args []string) {
	fs := flag.NewFlagSet("groups", flag.ExitOnError)
	verbose := fs.Bool("v", false, "also print community parent JID and flags")
	_ = fs.Parse(args)
	ctx := context.Background()
	client := newWAClient(ctx)
	if client.Store.ID == nil {
		fatal("groups: store.db is not paired — run `pair --phone ...` first")
	}
	connected := make(chan struct{}, 1)
	client.AddEventHandler(func(evt any) {
		if _, ok := evt.(*events.Connected); ok {
			select {
			case connected <- struct{}{}:
			default:
			}
		}
	})
	if err := client.Connect(); err != nil {
		fatal("connect: %v", err)
	}
	defer client.Disconnect()
	select {
	case <-connected:
	case <-time.After(60 * time.Second):
		fatal("groups: timed out connecting")
	}
	groups, err := client.GetJoinedGroups(ctx)
	if err != nil {
		fatal("groups: %v", err)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].Name < groups[j].Name })
	for _, g := range groups {
		if !*verbose {
			fmt.Printf("%s\t%s\n", g.JID, g.Name)
			continue
		}
		var flags []string
		if g.IsParent {
			flags = append(flags, "community")
		}
		if g.IsAnnounce {
			flags = append(flags, "announce")
		}
		fmt.Printf("%s\t%s\t%s\t%s\n", g.JID, g.Name, g.LinkedParentJID, strings.Join(flags, ","))
	}
}
