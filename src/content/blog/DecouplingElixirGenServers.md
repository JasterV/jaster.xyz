---
title: "Decoupling Elixir GenServers with Phoenix PubSub"
description: "A way to make our Genservers more easy to test and maintain by using PubSub"
pubDate: 2025-06-02
image: "./assets/me.png"
---

## TLDR

In this post I'd like to talk about a way to decouple a GenServer in your Elixir application in a way that makes it very easy to test and decouples it completely from the rest of the system.

We will do it by going through a real application I was working with recently (The code is not the same but the concept is).

I will first present a common Elixir application; including tests and we will discuss the problems with it. (TLDR; Coupling and messy tests).

Then I want to walk you through the process I went to solve these problems and we will discuss the final application, its benefits but also possible downsides.

## Automating a door

### Architecture

- Websocket client
- Door GenServer

The Door GenServer can receive a lock or unlock messages, and it will call the websocket client back to emit a "locked" or "unlocked" events when done.

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
