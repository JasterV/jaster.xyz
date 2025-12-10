---
title: "Decoupling Elixir GenServers with Phoenix PubSub"
description: "A way to make our GenServers more easy to test and maintain by using PubSub"
pubDate: 2025-06-05
image: "./assets/elixir.svg"
---

In this post I'd like to talk about an interesting way to decouple GenServers from the rest of the system by using a PubSub library.

We will do it by going through actual code. We will take a look at a regular Elixir application and we will discuss possible problems in it.

We will then use PubSub to refactor the application and we'll discuss the final result, its benefits but also possible downsides.

## Introduction

The project we will look at is very simple.

It consists of an IoT application that automates locking and unlocking a door.

We can imagine a user interacting with our application using some sort of remote control.

Then, when the door gets locked, we want a light to become red and a notification to be sent to us.
Finally, when the door gets unlocked, we want a light to become green and get notified too.

### Architecture

The application consists of:

- A GenServer that manages the state of the door and is responsible for locking or unlocking it.
- A module that manages the state of the lights and is responsible for changing colors.
- A module that manages notifications.

Let's look at a diagram of the whole system first:

<div class="diagram" align="center">

```d2 width="500" theme=303 title="Lock door flow"
direction: down

user {
  shape: c4-person
}

firmware {
  door_server: DoorServer
  lights: Lights
  notifications: Notifications

  label.near: bottom-left
}

third_party_notifications_service: 3rd party notifications service {
  shape: cloud
}

hardware: {
  shape: rectangle
}

user -> firmware.door_server: lock door {style.animated: true}
firmware.door_server -> firmware.lights: set_lights_red {style.animated: true}
firmware.door_server -> firmware.notifications: send_notification {style.animated: true}
firmware.door_server -> hardware: lock {style.animated: true}
firmware.lights -> hardware: set_lights_red {style.animated: true}
firmware.notifications -> third_party_notifications_service: send_notification {style.animated: true}
```

</div>

In this post we will focus on the firmware layer, more specifically in the DoorServer, its implementation and tests.

## Let's get into code

Let's go directly to the point, this is how we could implement a basic version of a DoorServer

```elixir
defmodule DoorAutomation.DoorServer do
  use GenServer

  @locked_state :locked
  @unlocked_state :unlocked

  alias DoorAutomation.Lights
  alias DoorAutomation.Notifications

  # Client API

  def start_link(initial_state \\ :locked) do
    GenServer.start_link(__MODULE__, initial_state, name: __MODULE__)
  end

  def lock do
    GenServer.call(__MODULE__, :lock)
  end

  def unlock do
    GenServer.call(__MODULE__, :unlock)
  end

  def get_state do
    GenServer.call(__MODULE__, :get_state)
  end

  # Server API

  @impl true
  def init(initial_state), do: {:ok, initial_state}

  @impl true
  def handle_call(:get_state, _from, current_state) do
    {:reply, current_state, current_state}
  end

  @impl true
  def handle_call(:lock, _from, _current_state) do
    # Call the underlying hardware
    # Hardware.unlock_door()
    Lights.set_red()
    Notifications.send_notification("Door has been Locked.")
    {:reply, :locked, @locked_state}
  end

  @impl true
  def handle_call(:unlock, _from, _current_state) do
    # Call the underlying hardware
    # Hardware.unlock_door()
    Lights.set_green()
    Notifications.send_notification("Door has been Unlocked.")
    {:reply, :unlocked, @unlocked_state}
  end
end
```

For the purpose of this article, the underlying calls that the DoorServer would need to make to the Hardware are left out of the code.

### Let's write some tests

Let's now see a basic test suite for the DoorServer:

```elixir
defmodule DoorAutomation.DoorServerTest do
  use ExUnit.Case

  alias DoorAutomation.DoorServer
  alias DoorAutomation.Lights
  alias DoorAutomation.Notifications

  setup do
    # Here we'd add whatever setup is needed
    # for the lights and notifications module
    {:ok, _} = start_supervised({DoorServer, :unlocked})
    :ok
  end

  test "locking the door changes state, light, and sends notification" do
    assert DoorServer.get_state() == :unlocked
    assert :ok = DoorServer.lock()
    assert DoorServer.get_state() == :locked
    assert Lights.get_color() == "red"
    assert Notifications.get_notifications() == ["Door has been Locked."]
  end

  test "unlocking the door changes state, light, and sends notification" do
    assert :ok = DoorServer.lock()
    assert DoorServer.get_state() == :locked

    Notifications.reset_notifications()

    assert :ok = DoorServer.unlock()
    assert DoorServer.get_state() == :unlocked
    assert Lights.get_color() == "green"
    assert Notifications.get_notifications() == ["Door has been Unlocked."]
  end
end
```

## What is wrong here?

Well, first of all I'd like to make it clear that there is actually nothing "wrong". The code we see above is completely valid.

It compiles and it could be enough for someone's needs.

With that said, let's talk about some possible issues we could run into.

### Coupling!

Following the previous design, we are coupling the DoorServer implementation with the lights and notifications modules.

The lights module might rely on hardware which could fail at any time (perhaps the circuits break) and the notifications module might rely on a network to send messages.

If the lights are faulty or the network goes down, the door could potentially stop working and the user wouldn't be able to lock or unlock it anymore.

In this case, if a user locks the door but the lights don't work or the notifications service is off, we want the door to lock anyway.

Ideally, any issues that might occur related to the lights or notifications system should be handled in their own modules.

The DoorServer should simply worry about locking or unlocking a door.

Coupling these modules spreads complexity that should be isolated.

### Coupling in tests

Coupling doesn't stop in the DoorServer module, it gets propagated into our tests.

Because our `lock` and `unlock` functions cause a series of side effects, we find ourselves having to add extra setup to test them.

Now, what was supposed to be a unit test suite for our DoorServer ends up looking more like an integration test suite.

Each time we add a new side effect that doesn't necessarily have to do with locking or unlocking a door, these tests have to be updated.

## So, what can we do?

We want to find a way to decouple the DoorServer from the rest of the system and protect it from unrelated issues.

I'm sure there are many ways you could do this, but in this article I want to talk about a specific one I recently deployed to production with success.

Let's make our Elixir application more event-driven!

We can make the DoorServer publish an event whenever the doors are successfully locked or unlocked.

Imagine if we had some sort of dedicated mailbox for our door events that any processes can subscribe to.

Then, a module interested on those events can simply subscribe to them and implement their own handlers.

This automatically makes our application more flexible, testable and maintainable.

Let's look at a diagram of the new target architecture:

<div class="diagram" align="center">

```d2 width="500" theme=303 title="event-driven architecture diagram"
direction: down

user {
  shape: c4-person
}

firmware {
  door_server: DoorServer
  lights: Lights
  notifications: Notifications

  door_topic: Door events topic {
    shape: queue
  }

  label.near: bottom-left
}

third_party_notifications_service: 3rd party notifications service {
  shape: cloud
}

hardware: {
  shape: rectangle
}

user -> firmware.door_server: lock door {style.animated: true}

firmware.door_server -> firmware.door_topic: door_locked {style.animated: true}

firmware.door_topic -> firmware.lights: door_locked {style.animated: true}

firmware.door_topic -> firmware.notifications: door_locked {style.animated: true}

firmware.door_server -> hardware: lock {style.animated: true}

firmware.lights -> hardware: set_lights_red {style.animated: true}

firmware.notifications -> third_party_notifications_service: send_notification {style.animated: true}
```

</div>

## Introducing Phoenix PubSub

[Phoenix PubSub](https://github.com/phoenixframework/phoenix_pubsub) is a known Elixir library that comes with the Phoenix framework.

It is a generic PubSub library that enables us to implement a publish-subscribe pattern in our Elixir applications.

It supports distribution by default (publishing and subscribing between erlang nodes) and multiple backends including Redis.

Even-though it explicitly says it is made for the Phoenix framework, it doesn't have any phoenix-related dependencies and can be used on its own.

Also we know Phoenix has been battle tested, so we can be sure Phoenix PubSub too!

## Rewriting the DoorServer

As mentioned, we'll rewrite the DoorServer by making it publish events and remove any coupling with the other modules:

```elixir
defmodule DoorAutomation.DoorServer do
  use GenServer
  alias Phoenix.PubSub

  @locked_state :locked
  @unlocked_state :unlocked

  @door_topic "door_events"

  # Client API

  def start_link(initial_state \\ :locked) do
    GenServer.start_link(__MODULE__, initial_state, name: __MODULE__)
  end

  def lock do
    GenServer.call(__MODULE__, :lock)
  end

  def unlock do
    GenServer.call(__MODULE__, :unlock)
  end

  def get_state do
    GenServer.call(__MODULE__, :get_state)
  end

  def events_topic(), do: @door_topic

  # Server API

  @impl true
  def init(initial_state) do
    {:ok, initial_state}
  end

  @impl true
  def handle_call(:get_state, _from, current_state) do
    {:reply, current_state, current_state}
  end

  @impl true
  def handle_call(:lock, _from, _current_state) do
    # Hardware.lock_door()

    Phoenix.PubSub.broadcast(DoorAutomation.PubSub, @door_topic, :door_locked)

    {:reply, :locked, @locked_state}
  end

  @impl true
  def handle_call(:unlock, _from, _current_state) do
    # Hardware.unlock_door()

    Phoenix.PubSub.broadcast(DoorAutomation.PubSub, @door_topic, :door_unlocked)

    {:reply, :unlocked, @unlocked_state}
  end
end
```

I'd like to also show how to write a subscriber for the lights module to react to pub sub events.

Also, to be consistent with our new design, we'll make it publish events when the lights are updated.

This way testing that the lights were updated after firing a door event becomes simpler as we'll see later.

```elixir
defmodule DoorAutomation.LightsSubscriber do
  use GenServer
  alias Phoenix.PubSub

  @lights_topic "lights_events"

  # Client API

  def start_link do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  def events_topic(), do: @lights_topic

  # Server API

  @impl true
  def init(_args) do
    # Subscribe to the topic when the GenServer starts
    :ok = Phoenix.PubSub.subscribe(DoorAutomation.PubSub, DoorAutomation.DoorServer.events_topic())
    {:ok, %{}}
  end

  @impl true
  def handle_info(:door_locked, state) do
    :ok = DoorAutomation.Lights.set_red()
    Phoenix.PubSub.broadcast(DoorAutomation.PubSub, @lights_topic, :lights_set_red)
    {:noreply, state}
  end

  @impl true
  def handle_info(:door_unlocked, state) do
    :ok = DoorAutomation.Lights.set_green()
    Phoenix.PubSub.broadcast(DoorAutomation.PubSub, @lights_topic, :lights_set_green)
    {:noreply, state}
  end
end
```

As a note, some people might prefer publishing the light events from inside the Lights module,
I don't have a strong opinion here so for simplicity I'll leave that logic in the LightsSubscriber.

## Rewriting our tests

Now we can rewrite our tests in a more event-driven way:

```elixir
defmodule DoorAutomation.DoorServerTest do
  use ExUnit.Case

  alias DoorAutomation.DoorServer
  alias Phoenix.PubSub

  setup do
    # Subscribe the current test process to the door events topic
    # This makes events published by DoorServer arrive in the test process's mailbox.
    :ok = PubSub.subscribe(DoorAutomation.PubSub, DoorAutomation.DoorServer.events_topic())

    {:ok, _} = start_supervised({DoorServer, :unlocked})

    :ok
  end

  test "locking the door changes state and publishes :door_locked event" do
    assert :ok = DoorServer.lock()
    assert DoorServer.get_state() == :locked
    assert_receive :door_locked
    refute_receive :door_unlocked
  end


  test "unlocking the door changes state and publishes :door_unlocked event" do
    assert :ok = DoorServer.unlock()
    assert DoorServer.get_state() == :unlocked
    assert_receive :door_unlocked
    refute_receive :door_locked
  end
end
```

Now to write tests for the subscriber we can do as follows:

```elixir
defmodule DoorAutomation.LightsSubscriberTest do
  use ExUnit.Case

  alias DoorAutomation.LightsSubscriber
  alias DoorAutomation.DoorServer
  alias Phoenix.PubSub

  setup do
    :ok = PubSub.subscribe(DoorAutomation.PubSub, LightsSubscriber.events_topic())

    {:ok, _subscriber_pid} = start_supervised(LightsSubscriber)
    :ok
  end

  test "LightsSubscriber subscribes sets lights red on :door_locked" do
    PubSub.broadcast(DoorAutomation.PubSub, DoorServer.events_topic(), :door_locked)

    assert_receive :lights_set_red
    refute_receive :lights_set_green
  end

  test "LightsSubscriber sets lights green on :door_unlocked" do
    PubSub.broadcast(DoorAutomation.PubSub, DoorServer.events_topic(), :door_unlocked)

    assert_receive :lights_set_green
    refute_receive :lights_set_red
  end
end
```

## What has improved?

By refactoring our DoorServer this way we only have to worry about maintaining and testing logic that concerns exclusively the door and the events it is meant to publish.

On the other hand, other modules can be tested very easily if we also refactor them to work in a more event-driven way.

For instance, as we just saw, to test if the lights change when a door change occurs we can use entirely our PubSub library to simulate door events happening and to assert that new events are published.

## Conclusions

Decoupling your elixir application components by making them more event-driven can make them more maintainable,
allowing them to grow independently of the rest of the system being sure you won't be breaking other modules as long as you don't break your events contract.

We've also seen how tests become simpler due to the fact that each test suite becomes more narrowed in scope.

There are some drawbacks though:

- Debugging becomes harder.
  - You are introducing an extra layer of asynchronous broadcast messaging and therefore your elixir processes become harder to debug.

- Event delivery is not ensured.
  - If a subscriber goes down, Phoenix PubSub won't try to re-deliver lost events once the process restarts.
  - Depending on your situation you might want to implement a more complex pub-sub system that does its best to ensure event delivery.

- You loose orchestration
  - You can't enforce the order each subscriber will consume the same event.
    If your case requires one side effect to happen before another
    (For example, the lights have to turn red before sending a notification) you will need to setup a single subscriber that executes them in order.

So as with every software pattern, depending on the requirements of your system this might or might not work for you.

In my case, my application didn't require side effects to be performed in order nor it was a problem if an event was lost because a process was down.

This is the first ever post that I publish online, I hope someone finds it useful.
If you have any doubts or feedback you can contact me via email, you can find it at the top of the page :)

Thank you for your time!
