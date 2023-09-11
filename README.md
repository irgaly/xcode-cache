# xcode-cache

A GitHub Action to cache Xcode's Build Cache for incremental build.

* This Action caches:
    * `DerivedData`
      * This contains Xcode's Build Cache.
    * `SourcePackages`
      * This contains SwiftPM cloned repositories.
    * Your source code's `modified time`
