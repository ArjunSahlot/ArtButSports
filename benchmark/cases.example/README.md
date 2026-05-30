# Example Benchmark Case Layout

Create one subfolder per benchmark case:

```text
benchmark/cases/
  lebron_jump/
    input.jpg
    classical_jump_pose.jpg
    similar_composition.png
  wnba_drive/
    input.png
    painting_target.jpg
```

The file named `input` is the query image. Every other image file in the same
case folder is treated as a target that should rank as high as possible.
