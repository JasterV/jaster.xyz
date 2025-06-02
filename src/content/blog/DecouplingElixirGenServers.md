---
title: "Decoupling Elixir GenServers with Phoenix PubSub"
description: "A way to make our Genservers more easy to test and maintain by using PubSub"
pubDate: 2025-06-02
image: "./assets/elixir.svg"
---

# TLDR

In this post I'd like to talk about an interesting way to decouple GenServers from the rest of the system by using a PubSub library.

We will do it by going through actual code. We will take a look at a regular Elixir application and we will discuss possible problems in it.

We will then use PubSub to refactor the application and we'll discuss the final result, its benefits but also possible downsides.

## Introduction

The project we will look at is very simple.

It consists of an IoT application that automates locking and unlocking a door.

A user can interact will perhaps interact with our application using some sort of remote control.

Then, when the door gets locked, we want a light to become red and a notification to be sent to us.
Finally, when the door gets unlocked, we want a light to become green and get notified too.

### Architecture

The application consists of:

- A GenServer that manages the state of the Door and is responsible for locking or unlocking it.
- A GenServer that manages the state of the lights and is responsible for changing colors.
- A GenServer that manages notifications.

Let's look at a diagram of the whole system first:

<div align="center">

```d2 width="500" theme=303 title="Lock door flow"
direction: down

user {
  shape: c4-person
}

firmware {
  door_server: Door Server
  light_server: Light Server
  notifications_server: Notifications Server

  label.near: bottom-left
}

third_party_notifications_service: 3rd party notifications service {
  shape: cloud
}

hardware: {
  shape: rectangle
}

user -> firmware.door_server: lock door {style.animated: true}
firmware.door_server -> firmware.light_server: set_lights_red {style.animated: true}
firmware.door_server -> firmware.notifications_server: send_notification {style.animated: true}
firmware.door_server -> hardware: lock {style.animated: true}
firmware.light_server -> hardware: set_lights_red {style.animated: true}
firmware.notifications_server -> third_party_notifications_service: send_notification {style.animated: true}
```
</div>

In this post we will focus on the firmware layer, more specifically in the Door server, its implementation and tests.

## Let's get into code

### Door GenServer

### Let's write some tests

## What is wrong here?

Possible problems:

- Coupling

## How can we improve it?

- Decouple the Door server by making it emit an event when the door is locked or unlocked

## Introducing Phoenix PubSub

## Rewriting our tests

## Conclusions
