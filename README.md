# xcode-cache

A GitHub Action to store Xcode's Build Cache for incremental build on CI.

* This action caches:
    * `DerivedData`
        * That contains Xcode's Build Cache.
    * `SourcePackages`
        * That contains SwiftPM cloned repositories.
    * Your source code's `modified time` (mtime)

# Usage

Use this action in GitHub Actions workflow.

```yaml
    - uses: actions/checkout@v4
      ...
    - uses: irgaly/xcode-cache@v1
      with:
        key: xcode-cache-deriveddata-${{ github.workflow }}-${{ github.sha }}
        restore-keys: xcode-cache-deriveddata-${{ github.workflow }}-
      ...
    - name: (Your build step)
      run: |
        fastlane ...
```

Xcode's DerivedData is used for incremental build, so it's recommended to use `github.sha` in cache
key.

# Configuration examples

## Custom DerivedData and SourcePackages locations

```yaml
    - uses: irgaly/xcode-cache@v1
      with:
        key: xcode-cache-deriveddata-${{ github.workflow }}-${{ github.sha }}
        restore-keys: xcode-cache-deriveddata-${{ github.workflow }}-
        deriveddata-directory: DerivedData
        sourcepackages-directory: SourcePackages
      ...
```

## Store all project file's mtime attributes

```yaml
    - uses: irgaly/xcode-cache@v1
      with:
        key: xcode-cache-deriveddata-${{ github.workflow }}-${{ github.sha }}
        restore-keys: xcode-cache-deriveddata-${{ github.workflow }}-
        restore-mtime-targets: |
          YourApp/**/*
      ...
```

## Use custom cache key for SourcePackages cache

The cache key of SourcePackages is default
to `irgaly/xcode-cache-sourcepackages-${{ hashFiles('.../Package.resolved') }}`.
You can specify your custom key.

```yaml
    - uses: irgaly/xcode-cache@v1
      with:
        key: xcode-cache-deriveddata-${{ github.workflow }}-${{ github.sha }}
        restore-keys: xcode-cache-deriveddata-${{ github.workflow }}-
        swiftpm-cache-key: your-soucepackages-${{ hashFiles('your/path/to/Package.resolved') }}
        swiftpm-cache-restore-keys: |
          your-custom-restore-keys-here-...
      ...
```

# Platform

This action is for only macOS runner.

# Caching details

This action caches below entries.

## DerivedData

The DerivedData directory has all of intermediates build output files such as compiled objects.

A DerivedData directory that is default to `~/Library/Developer/Xcode/DerivedData` or specified
by `deriveddata-directory` input.

This directory will be cached with nanosecond resolution mtime
by [@actions/cache](https://github.com/actions/toolkit/).

## SourcePackages

The SourcePackages directory has clones of SwiftPM if you used SwiftPM dependencies with Xcode.

A SourcePackages directory that is default
to `~/Library/Developer/Xcode/DerivedData/{App name}-{ID}/SourcePackages` or specified
by `sourcepackages-directory` input.

This directory will be cached with nanosecond resolution mtime
by [@actions/cache](https://github.com/actions/toolkit/).

## Source Code's mtime attributes

Xcode stores build input file's mtime information with **nanosecond resolution** to DerivedData.
So, on CI environment, it's required to restore all input file's mtime from previous build after
checkout sources.

This action will store input file's mtime attributes and their SHA-256 hash
to `(DerivedData directory)/xcode-cache-mtime.json`.

Then this action will restore their mtime attributes if their SHA-256 are same after checkout
sources.

For example, `xcode-cache-mtime.json`'s contents will be:

```json
[
  {
    "path": "sample/MyApp/MyApp/ContentView.swift",
    "time": "1694751978.570357000",
    "sha256": "a1a6707fc09625c0a5f49c3b8127da42358085506bbe2246469f00c0a7a2276b"
  },
  {
    "path": "sample/MyApp/MyApp/MyAppApp.swift",
    "time": "1694751978.543212000",
    "sha256": "0b97d516fc64a2ec833b9eefe769d658947c66cc528ada637ac916da7b87f5bc"
  },
  ...
]
```

### Default target file's to store mtime attributes

If `use-default-mtime-targets` is set to true (default),
this action will store these file's mtime attributes:

* `**/*.swift`
* `**/*.xib`
* `**/*.storyboard`
* `**/*.strings`
* `**/*.plist`
* `**/*.xcassets`
* `**/*.bundle`
* `**/*.bundle/**/*`
* `**/*.xcdatamodel`
* `**/*.xcdatamodel/**/*`
* `**/*.m`
* `**/*.mm`
* `**/*.h`
* `**/*.c`
* `**/*.cc`
* `**/*.cpp`
* `**/*.hpp`
* `**/*.hxx`

You can add any target by glob pattern with `restore-mtime-targets` input.

# All Options

```yaml
    - uses: irgaly/xcode-cache@v1
      with:
        # Cache key for DerivedData cache
        #
        # required
        key: { your derived data key }

        # Restore keys for DerivedData cache
        #
        # optional, multiline
        # dofault: empty
        restore-keys: |
          {your derived data restore keys}

        # DerivedData directory path
        #
        # optional
        # default: ~/Library/Developer/Xcode/DerivedData
        deriveddata-directory: { your DerivedData directory path }

        # SourcePackages directory path
        #
        # optional, multiline
        # default: {DerivedDirectory path}/SourcePackages
        sourcepackages-directory: { your SourcePackages directory path }

        # Target file glob patterns to store mtime attributes
        # This glob pattern is applied with GitHub Actions toolkit glob option implicitDescendants = false
        #
        # optional, multiline
        # default: empty
        restore-mtime-targets: |
          your/target/**/*

        # Xcode's Package.resolved file path glob patterns
        # Package.resolved file is used for swiftpm-cache-key if it is not specified
        #
        # optional, multiline
        # default:
        #   **/*.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
        #   **/*.xcworkspace/xcshareddata/swiftpm/Package.resolved
        swiftpm-package-resolved-file: |
          YourApp.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved

        # Cache key for SourcePackages
        #
        # optional
        # default: irgaly/xcode-cache-sourcepackages-${{ hashFiles( {swiftpm-package-resolved-file} ) }}'
        swiftpm-cache-key: { your SourcePackages cache key }

        # Cache restore keys for SourcePackages
        #
        # optional
        # default: empty
        swiftpm-cache-restore-keys:

        # Use default target file glob patterns to store mtime attributes
        #
        # optional
        # default: true
        use-default-mtime-targets: true

        # More detailed logging
        #
        # optional
        # default: false
        verbose: false

```


