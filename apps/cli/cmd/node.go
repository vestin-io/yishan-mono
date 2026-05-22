package cmd

import (
	"github.com/spf13/cobra"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/output"
	cliruntime "yishan/apps/cli/internal/runtime"
)

var nodeCmd = &cobra.Command{
	Use:   "node",
	Short: "Node operations",
	Long:  `Register, list, and delete compute nodes in a Yishan organization.`,
}

var nodeListCmd = &cobra.Command{
	Use:   "list",
	Short: "List organization nodes",
	Long:  `List all nodes registered to the current organization.`,
	Example: `  yishan node list
  yishan node list --output json`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().ListNodes(orgID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeRegisterCmd = &cobra.Command{
	Use:   "register",
	Short: "Register a node with the organization",
	Long: `Register (or update) a compute node by its stable node ID.

Unlike a plain create, this call is idempotent — if a node with the same
node ID already exists it is updated when --update-if-exists is set.
Scope "private" limits the node to the registering user; "shared" makes
it available to all org members.`,
	Example: `  yishan node register --node-id <id> --name my-server
  yishan node register --node-id <id> --name my-server --scope private --update-if-exists
  yishan node register --node-id <id> --name my-server --endpoint https://my.host:8080`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}
		name, err := cmd.Flags().GetString("name")
		if err != nil {
			return err
		}
		scope, err := cmd.Flags().GetString("scope")
		if err != nil {
			return err
		}
		endpoint, err := cmd.Flags().GetString("endpoint")
		if err != nil {
			return err
		}
		metadataOS, err := cmd.Flags().GetString("metadata-os")
		if err != nil {
			return err
		}
		metadataVersion, err := cmd.Flags().GetString("metadata-version")
		if err != nil {
			return err
		}
		updateIfExists, err := cmd.Flags().GetBool("update-if-exists")
		if err != nil {
			return err
		}

		input := api.RegisterNodeInput{
			NodeID:         nodeID,
			Name:           name,
			Scope:          scope,
			Endpoint:       endpoint,
			UpdateIfExists: &updateIfExists,
		}
		if metadataOS != "" || metadataVersion != "" {
			metadata := map[string]any{}
			if metadataOS != "" {
				metadata["os"] = metadataOS
			}
			if metadataVersion != "" {
				metadata["version"] = metadataVersion
			}
			input.Metadata = metadata
		}

		response, err := cliruntime.APIClient().RegisterNode(input)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

var nodeDeleteCmd = &cobra.Command{
	Use:   "delete",
	Short: "Delete organization node",
	Long:  `Deregister a node from the organization. Any workspaces currently assigned to the node will lose their compute backend.`,
	Example: `  yishan node delete --node-id <node-id>`,
	RunE: func(cmd *cobra.Command, _ []string) error {
		orgID, err := resolveOrgID(cmd)
		if err != nil {
			return err
		}
		nodeID, err := cmd.Flags().GetString("node-id")
		if err != nil {
			return err
		}

		response, err := cliruntime.APIClient().DeleteNode(orgID, nodeID)
		if err != nil {
			return err
		}

		return output.PrintAny(response)
	},
}

func init() {
	rootCmd.AddCommand(nodeCmd)
	nodeCmd.AddCommand(nodeListCmd)
	nodeCmd.AddCommand(nodeRegisterCmd)
	nodeCmd.AddCommand(nodeDeleteCmd)

	addOrgIDFlag(nodeListCmd)

	nodeRegisterCmd.Flags().String("node-id", "", "stable node ID (e.g. daemon ID)")
	nodeRegisterCmd.Flags().String("name", "", "node name")
	nodeRegisterCmd.Flags().String("scope", "private", "node scope (private|shared)")
	nodeRegisterCmd.Flags().String("endpoint", "", "node endpoint URL")
	nodeRegisterCmd.Flags().String("metadata-os", "", "node OS metadata")
	nodeRegisterCmd.Flags().String("metadata-version", "", "node version metadata")
	nodeRegisterCmd.Flags().Bool("update-if-exists", false, "update the node if it already exists")
	cobra.CheckErr(nodeRegisterCmd.MarkFlagRequired("node-id"))
	cobra.CheckErr(nodeRegisterCmd.MarkFlagRequired("name"))

	addOrgIDFlag(nodeDeleteCmd)
	nodeDeleteCmd.Flags().String("node-id", "", "node ID")
	cobra.CheckErr(nodeDeleteCmd.MarkFlagRequired("node-id"))
}
