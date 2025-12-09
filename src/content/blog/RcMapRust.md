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

```rust
{
    let topic = map.get(topic_name).unwrap();
    // This will cause a deadlock!
    let _ = map.remove(topic_name);
}    
```

#### Redefining RcMap

Now the definition of the RcMap should look like this

```rust
pub struct RcMap<K, V> {
    inner: Arc<DashMap<K, (isize, V)>>,
}
```

#### Defining `ObjectRef`

Now that we know exactly the purpose of an `ObjectRef`, let's get into the implementation:

```rust
#[derive(Debug)]
pub struct ObjectRef<K, V>
where
    K: Hash + Eq,
{
    parent_ref: Weak<DashMap<K, (isize, V)>>,
    key: K,
    value: V,
}
```

If you are not familiar with it, `Weak` is a version of Arc that holds a non-owning reference to the data.
A `Weak` pointer can be created from an `Arc` "downgrading" it (see [documentation](https://doc.rust-lang.org/std/sync/struct.Arc.html#method.downgrade)) and it will not increase the reference count when creating it.
This way, the `RcMap` is kept as the real owner of the `Arc` instead of the `ObjectRef`s.

#### Implementing the drop behavior

Now we can get into the real deal, how to automatically clean up map entries!

```rust
impl<K, V> Drop for ObjectRef<K, V>
where
    K: Hash + Eq,
{
    fn drop(&mut self) {
        let Some(map) = self.parent_ref.upgrade() else {
            return;
        };

        map.alter(&self.key, |_, (count, value)| (count - 1, value));
        map.remove_if(&self.key, |_, (count, _)| *count <= 0);
    }
}
```

The implementation is fairly simple as the `DashMap` API offers a pleasantly clean way of altering and removing values.

First we need to [upgrade](https://doc.rust-lang.org/std/sync/struct.Weak.html#method.upgrade) the weak reference to an `Arc`.

If the value was already dropped, it will return none and we will do nothing.

If the original map is not yet dropped we can then update it.

Now we see the sense of storing also the `key` in the object ref, as we can use it inside the `drop` implementation to update the inner map.

So, first we decrease the reference count by 1.

Then, if the `count` is equal or less than 0 we simply remove the entry, easy!

#### Reimplementing RcMap

Now we have an object which we can use to return whenever someone wants to get a value, and we know that this object
will take care of deallocating map entries "on-drop".

Let's see how to reimplement our `RcMap` to take advantage of the DashMap and `ObjectRef`.

```rust
impl<K, V> RcMap<K, V>
where
    K: Hash + Eq + Clone + Debug,
    V: Clone,
{
    pub fn new() -> Self {
        Self {
            inner: Arc::new(DashMap::new()),
        }
    }

    pub fn get(&self, key: K) -> Option<ObjectRef<K, V>> {
        self.inner
            .alter(&key, |_, (count, value)| (count + 1, value));

        let Some(value_ref) = self.inner.get(&key) else {
            return None;
        };

        let (_count, value) = value_ref.value();

        Some(ObjectRef {
            key,
            parent_ref: Arc::downgrade(&self.inner),
            value: value.clone(),
        })
    }


    pub fn insert(&self, key: K, value: V) -> Result<ObjectRef<K, V>, InsertError<K, V>> {
        if let Some(object_ref) = self.get(key.clone()) {
            return Err(InsertError::AlreadyExists(key, object_ref));
        }

        let _prev = self.inner.insert(key.clone(), (1, value.clone()));

        Ok(ObjectRef {
            key,
            parent_ref: Arc::downgrade(&self.inner),
            value,
        })
    }
}
```

The implementation looks quite self-explanatory to me, but there are a few things to point here.

First, both the key and value need to be "clone-able",  and that makes sense because we need to clone these values from the inner map into the `ObjectRef`.

We could perhaps use `Arc` to wrap both the key and the value to not enforce them to implement Clone, but I was not sure about it so this has simply been an implementation detail I've left this way.

Second, we see that the `insert` function returns an `InsertError::AlreadyExists` error if the program tries to insert an entry with a key that already exists.

This is the definition of the error type:

```rust
#[derive(thiserror::Error, Debug)]
pub enum InsertError<K, V>
where
    K: Hash + Eq + Debug,
{
    #[error(
        "An entry already exists with the given key: '{0:?}'. You must wait until all existing object references are dropped for the pair to be removed."
    )]
    AlreadyExists(K, ObjectRef<K, V>),
}  
```

This check is done because for consistency reasons an entry must only be removed by the last `ObjectRef` being dropped.

Otherwise, there could exist unrelated old `ObjectRef` instances modifying the reference count of the new inserted entry.

To prevent this from happening, we enforce that to be able to insert an entry with an already existing key,
one must wait until all `ObjectRef`s pointing to the current entry are dropped.

Then, you can see how we return an `ObjectRef` containing the already existing entry along with the error.

This is not necessary but it can come in handy when working with `RcMap`.

## Usage example

```rust
let map = RcMap::new();

{
    let inserted_ref = map
        .insert("potatoe", "chair")
        .expect("No entry should exist");

    let obj_ref = map
        .get("potatoe")
        .expect("This entry exists");

    // All refs are dropped, the entry is removed
}

let obj_ref = map.get("potatoe");

assert!(obj_ref.is_none());
```

The example above should give a clear idea of how to use our `RcMap` :)

#### Conclusions

It has been a very interesting journey to learn how to implement such a data structure.

We've learned about a thread-safe hash map called `DashMap` which combined with an `Arc` gives automatically to our `RcMap` the power of being safe to be shared and used among threads.

We've also learned about `Weak`, and how to use it to safely keep non-owning references to data that could or could not exist.

I know that it could be more feature complete with operations such as `remove` or `alter`, the last one probably being more complex as we might decide to also alter all `ObjectRef`s pointing to that entry.

I kept the implementation as simple as I could to serve the purpose needed in my [event_bus.rs](https://github.com/JasterV/event_bus.rs) crate.

On a later post I want to talk about this crate and how to use an `RcMap` to implement an `EventBus` in a very simple way.

If you got here I can't thank you enough! I hope you enjoyed, stay tuned!
