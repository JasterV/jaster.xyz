---
title: "Implementing a reference-count map in Rust"
description: "A reference-count map is a data structure that keeps track of how many references to an entry exist and drops it when the last reference drops."
pubDate: 2025-12-03
image: "./assets/elixir.svg"
---

I came up with the term Reference Count Map for a map-like data structure that uses a reference counting system to know when to automatically clean up an entry.

The term is not officially registered by me and I am not aware whether someone has already come up with it for an already common and settled data structure.

In this post I'd like to share how did I implement such a data structure in Rust.

It is going to be very simple and could for sure be improved and contain more features but I wanted to keep it simple for my own needs.

With all of this said, let's start!

## First of all, why?

I wanted to experiment with the idea of implementing an `Event bus` in Rust.

Lately I've been working a lot with Elixir and the popular library Phoenix PubSub.

This library offers a very simple API which allows developers to simply call `PubSub.subscribe(topic_name)` function to subscribe to a topic
and `PubSub.publish(topic_name, data)` to publish data to it.

I wanted to implement a type that provided the same API in Rust, with the same friendly user experience that `Phoenix PubSub` provides to Elixir developers.

I wanted this `Event Bus` to internally manage the allocation and deallocation of `topics` in a way that users will never have to worry about it.

So I needed a way to create `topics` on the fly anytime that a process subscribes to them and to be able to automatically clean them up from memory
as soon as all the subscribers exit.

Here I identified a pattern that could be encapsulated in a data structure, one that was able to keep track of how many references to an entry exist and that
somehow was able to also keep track of references getting dropped from memory.

This is how the idea of creating what I named a `reference-counting map` came to life!

## Let's get into it!

Let's go step by step, I will try to drive you through the same thought process I went through.

First of all, we need to store key-value pairs on a map, so let's start defining our `RcMap`:

```rust
pub struct RcMap<K, V> {
    inner: HashMap<K, V>,
}
```

Now we need a way to keep track of how many references exist. Let's keep it simple, we'll just update the map to include a counter along with the stored value:

```rust
pub struct RcMap<K, V> {
    inner: HashMap<K, (isize, V)>,
}
```

Let's start implementing the basics we can think of right now:

```rust
impl<K, V> RcMap<K, V>
where
    K: Hash + Eq + Debug,
    V: Clone,
{
    pub fn new() -> Self {
        Self {
            inner: HashMap::new(),
        }
    }

    pub fn get(&mut self, key: K) -> Option<V> {
        let maybe = self.inner.get(&key).cloned();

        match maybe {
            Some((count, value)) => {
                self.inner.insert(key, (count + 1, value.clone()));
                Some(value)
            }
            None => None,
        }
    }

    pub fn insert(&mut self, key: K, value: V) {
        let _ = self.inner.insert(key, (1, value));
    }
}
```

First the obvious:

- When inserting a new key-value pair we will insert it with a reference count of 1.

- Whenever we fetch an entry, we increment the reference count by 1.

But now a few problems arise:

- When inserting a pair, the reference count should automatically go down to 0 because after it completes no one is holding a reference to it!

- When we get a value we increment the reference counter, but how will the counter be decremented? How can we track that the value that was fetched gets dropped?

### Implementing the `ObjectRef`

We need a way to encapsulate the values we return to the caller in a way that when they get dropped, 2 things happen:

- The reference count gets decremented by 1.
- If the count hits 0, we clean up the entry from the map.

I decided to call this "wrapper" `ObjectRef`, which sounded generic enough to me to be a valid name.

The mentioned behavior of an `ObjectRef` naturally implies that it will need write access to the internal map stored by `RcMap`.

To be able to do that, we need 2 things:

- A synchronization mechanism so that the map can be safely updated from multiple places at a time.

- A way to share the ownership of the map, otherwise it won't be possible for the map to be owned by `RcMap` and `ObjectRef` at the same time.

For an experienced Rustacean this pattern will probably sound familiar... and exactly! What we need here is something like:

```rust
Arc<RwLock<HashMap<_, _>>>
```

As you might know an `Arc` allows us to share the ownership of a value in a read-only way (no mutable references are allowed).

A `RwLock` is a concurrency primitive that allows us to hold a write lock to a value so we are sure that the map can only be updated from 1 place at a time.

Most importantly, `RwLock` implements the internal mutability pattern, which means that we can mutate the internal value (while holding the write lock) without taking a mutable reference to the `RwLock`.

This is important because this means that thanks to the combination of `Arc` and `RwLock`, the 2 conditions we mentioned previously are met!

#### Using DashMap instead of `RwLock<HashMap<K, V>>`

The need to have a thread-safe map that allows users to safely read/write entries from multiple places at a time is a very common pattern in Rust.

Some time ago I learned about the [DashMap](https://docs.rs/dashmap/latest/dashmap/struct.DashMap.html), a concurrent hashmap
which primary goal is to be a direct replacement for `RwLock<HashMap<K, V>>`!

When working with a `DashMap` you don't have to worry about asking for a `write` lock and handle cases such as the internal lock being `poisoned`,
all of the synchronization is handled internally and the API that is offered to you is very simple and friendly while still getting all the benefits of a fully
concurrent and read-write safe hashmap.

**Beware of deadlocks**

`DashMap`s are awesome but you still need to know how to use them properly!

If you try to perform a write operation while in the same scope you are holding a read reference to it, the DashMap will silently deadlock instead of panicking or returning an error.

// TODO: Put an example

#### Redefining RcMap

#### Defining `ObjectRef`

#### Implementing the drop behavior

#### Reimplementing RcMap

#### Conclusions
