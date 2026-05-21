package agentcmd

type copilotBuilder struct{}

func (b copilotBuilder) Binary() string { return "copilot" }

func (b copilotBuilder) Args(prompt, model string) []string {
	args := []string{"run", "--prompt", prompt}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
}
