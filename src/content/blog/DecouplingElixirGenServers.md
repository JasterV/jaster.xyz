---
title: "Decoupling Elixir GenServers with Phoenix PubSub"
description: "A way to make our Genservers more easy to test and maintain by using PubSub"
pubDate: 2025-06-02
image: "./assets/elixir.svg"
---

# TLDR

In this post I'd like to talk about a way to decouple a GenServer in your Elixir application in a way that makes it very easy to test and decouples it completely from the rest of the system.

We will do it by going through a real application I was working with recently (The code is not the same but the concept is).

I will first present a common Elixir application; including tests and we will discuss the problems with it. (TLDR; Coupling and messy tests).

Then I want to walk you through the process I went to solve these problems and we will discuss the final application, its benefits but also possible downsides.

## Automating a door

So the project we will look at is very simple.

It consists of an IoT application that controls a door and waits for messages from a server to lock or unlock the door.

### Architecture

The application consists of:

- A Websocket client that listens for `lock`/`unlock` messages from a server and sends back a `locked` or `unlocked` message after the operations have succeeded.
  In case of an error it will send an error message so the caller knows something is wrong.
  We will not consider timeouts in here, just to make it as simple as possible.

- A GenServer that manages the state of the Door and is responsible for locking or unlocking it.

It is important to note that we are implementing a Websocket client, not server.
In this case we imagine there is a central server that is responsible for keeping track of the state of multiple doors in the house, and that there are users that can tell the server "lock door A".
We skip all of that for the sake of making this very simple, but I think having more context is important.

Let's look at a simple diagram.

```d2 title="Door IoT Ws client"
direction: right

Documentation -> Starlight -> Website: {style.animated: true}
```

## Let's get into code

### Websocket client

### Door GenServer

## Let's write some tests

## What is going on here?

Possible problems:

- Duplication of test setup
- The door tests having to call the websocket client to know if the event is sent via the websocket

## How can we improve it?

- Decouple the Door server by making it emit an event when the door is locked or unlocked

## Introducing Phoenix PubSub

## Rewriting our tests

## Conclusions
