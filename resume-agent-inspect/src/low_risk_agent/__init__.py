"""Public pipeline exports, loaded only when needed by the caller."""
from importlib import import_module

__all__ = ["PipelineConfig", "PipelineResult", "ResumeTailoringPipeline", "RunRequest"]


def __getattr__(name):
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name = ".pipeline" if name == "ResumeTailoringPipeline" else ".models"
    value = getattr(import_module(module_name, __name__), name)
    globals()[name] = value
    return value
